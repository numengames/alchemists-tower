import { NextResponse } from 'next/server';
import { z } from 'zod';

import { withAdmin, withAuth } from '@/lib/api-auth';
import {
  backendUnreachablePayload,
  isBackendUnreachable,
} from '@/lib/connection-error';
import { listWorlds } from '@/lib/k8s';
import { prisma } from '@/lib/prisma';
import {
  composeSecretPayload,
  createWorldSecret,
  deleteWorldSecret,
  getTemplateDefaults,
} from '@/lib/aws-secrets';
import {
  applyCreateWorldChangeset,
  applyDeleteWorldChangeset,
  type ChangesetResult,
} from '@/lib/github';
import { createWorldSchema, WorldDbPermissionError } from '@/lib/world-db';
import {
  deleteWorldCname,
  GoDaddyApiError,
  GoDaddyAuthError,
  upsertWorldCname,
} from '@/lib/godaddy';
import { copyDefaultAssets, S3TemplateMissingError } from '@/lib/s3-assets';
import {
  deriveAssetsBaseUrl,
  deriveAwsSecretName,
  deriveDbSchema,
  deriveHelmReleaseName,
  deriveHostname,
  deriveNamespace,
  deriveWorldRepoPaths,
  generateWorldFiles,
  getSupportedOrgs,
  isValidOrg,
  isValidWorldName,
} from '@/lib/world-templates';
import {
  CHART_VERSION,
  type SecretKey,
} from '@/lib/world-templates-constants';
import { Environment, WorldStatus } from '@/generated/prisma/enums';

/**
 * Build the per-world `ASSETS_S3_URI` value. The hyperfy2 runtime parses it
 * as `s3://USER:PASS@HOST/PATH` so it can authenticate to S3 directly. When
 * the auth env vars are missing, falls back to a plain `s3://bucket/path`.
 */
function buildAssetsS3Uri(args: {
  org: string;
  world: string;
  envSegment: string;
  rootPrefix: string;
}): string {
  const accessKeyId = process.env.HYPERFY_S3_ACCESS_KEY_ID ?? '';
  const secretAccessKey = process.env.HYPERFY_S3_SECRET_ACCESS_KEY ?? '';
  const host = process.env.HYPERFY_S3_BUCKET_HOST ?? '';
  const path = `/${args.rootPrefix}/${args.org}/${args.world}/${args.envSegment}/assets`;

  if (host && accessKeyId && secretAccessKey) {
    const auth = `${encodeURIComponent(accessKeyId)}:${encodeURIComponent(secretAccessKey)}@`;
    return `s3://${auth}${host}${path}`;
  }
  // Fallback: plain s3:// URI (no auth). The pod will need IRSA or another
  // credential source to access the bucket.
  const bucket = process.env.ASSETS_BUCKET ?? '';
  return `s3://${bucket}${path}`;
}

export async function GET(request: Request) {
  return withAuth(request, async () => {
    try {
      const worlds = await listWorlds();
      return NextResponse.json({ worlds });
    } catch (error) {
      console.error('[api/worlds] failed to list worlds:', error);
      if (isBackendUnreachable(error)) {
        return NextResponse.json(
          backendUnreachablePayload('Could not reach the cluster API.'),
          { status: 503 },
        );
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      return NextResponse.json(
        { error: 'Failed to list worlds', detail: message },
        { status: 502 },
      );
    }
  });
}

const USER_OVERRIDABLE_SECRET_KEYS = [
  'DB_URI',
  'LIVEKIT_API_KEY',
  'LIVEKIT_API_SECRET',
  'LIVEKIT_WS_URL',
  'AI_PROVIDER',
  'AI_MODEL',
  'AI_EFFORT',
  'AI_API_KEY',
] as const satisfies readonly SecretKey[];

const secretOverridesSchema = z
  .object(
    Object.fromEntries(
      USER_OVERRIDABLE_SECRET_KEYS.map((key) => [
        key,
        z.string().max(4096).optional(),
      ]),
    ) as Record<(typeof USER_OVERRIDABLE_SECRET_KEYS)[number], z.ZodOptional<z.ZodString>>,
  )
  .strict();

const createWorldInputSchema = z.object({
  org: z.string().refine((v) => isValidOrg(v), {
    message: `Unsupported org. Supported: ${getSupportedOrgs().join(', ')}`,
  }),
  world: z.string().refine(isValidWorldName, {
    message: 'World name must match ^[a-z][a-z0-9-]{1,28}[a-z0-9]$',
  }),
  env: z.enum(['pre', 'pro']),
  description: z.string().max(500).default(''),
  includeAi: z.boolean().default(false),
  secretOverrides: secretOverridesSchema.default({}),
  resources: z
    .object({
      cpuLimit: z.string().regex(/^[0-9]+(m|)$/).optional(),
      memoryLimit: z.string().regex(/^[0-9]+(Mi|Gi)$/).optional(),
    })
    .optional(),
  imageTag: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[A-Za-z0-9._-]+$/)
    .optional(),
  publicMaxUploadSize: z.string().regex(/^[0-9]+$/).optional(),
});

export async function POST(request: Request) {
  return withAdmin(request, async (session) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = createWorldInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const input = parsed.data;
    const dbEnv: Environment = input.env === 'pre' ? Environment.PRE : Environment.PRO;

    const existing = await prisma.world.findFirst({
      where: { organization: input.org, slug: input.world, environment: dbEnv },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: `World ${input.org}/${input.world} (${input.env}) already exists` },
        { status: 409 },
      );
    }

    const generated = generateWorldFiles({
      org: input.org,
      world: input.world,
      env: input.env,
      resources: input.resources,
      imageTag: input.imageTag,
      publicMaxUploadSize: input.publicMaxUploadSize,
    });

    let templateDefaults;
    try {
      templateDefaults = await getTemplateDefaults();
    } catch (error) {
      console.error('[api/worlds POST] reading template defaults failed:', error);
      return NextResponse.json(
        { error: 'Failed to read template defaults' },
        { status: 502 },
      );
    }

    const dbSchema = deriveDbSchema(input.org, input.world, input.env);
    const assetsRootPrefix = process.env.ASSETS_ROOT_PREFIX ?? 'hyperfy-spaces';
    const envSegment = input.env === 'pre' ? 'dev' : 'latest';
    const systemOverrides: Partial<Record<SecretKey, string>> = {
      DB_SCHEMA: dbSchema,
      ASSETS_S3_URI: buildAssetsS3Uri({
        org: input.org,
        world: input.world,
        envSegment,
        rootPrefix: assetsRootPrefix,
      }),
    };
    const payload = composeSecretPayload(
      templateDefaults.values,
      { ...input.secretOverrides, ...systemOverrides },
      { includeAi: input.includeAi },
    );

    try {
      await createWorldSchema(dbSchema);
    } catch (error) {
      if (error instanceof WorldDbPermissionError) {
        console.error('[api/worlds POST] schema permission denied:', error.message);
        return NextResponse.json(
          {
            error: 'Database role lacks CREATE on the worlds database',
            hint: 'Grant CREATE on the worlds database to the backoffice role and retry',
          },
          { status: 412 },
        );
      }
      console.error('[api/worlds POST] schema create failed:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return NextResponse.json(
        { error: 'Failed to create database schema', detail: message },
        { status: 502 },
      );
    }

    let assetsResult: { copied: number; envSegment: string; destPrefix: string };
    try {
      assetsResult = await copyDefaultAssets({
        org: input.org,
        world: input.world,
        env: input.env,
      });
    } catch (error) {
      if (error instanceof S3TemplateMissingError) {
        console.error('[api/worlds POST] S3 template missing');
        return NextResponse.json(
          {
            error: 'Default S3 template is empty',
            hint: 'Populate the default-assets template prefix, then retry',
          },
          { status: 412 },
        );
      }
      console.error('[api/worlds POST] S3 copy failed:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return NextResponse.json(
        { error: 'Failed to copy default assets', detail: message },
        { status: 502 },
      );
    }

    const secretId = deriveAwsSecretName(input.org, input.world, input.env);
    let secretArn: string | undefined;
    try {
      const secretResult = await createWorldSecret({
        secretId,
        payload,
        description: `World secret for ${input.org}/${input.world} (${input.env})`,
      });
      secretArn = secretResult.arn;
    } catch (error) {
      console.error('[api/worlds POST] secret create failed:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return NextResponse.json(
        { error: 'Failed to create secret', detail: message },
        { status: 502 },
      );
    }

    let dnsResult: { skipped: boolean; recordName: string; domain: string; target: string };
    try {
      dnsResult = await upsertWorldCname({
        org: input.org,
        world: input.world,
        env: input.env,
      });
    } catch (error) {
      console.error(
        `[api/worlds POST] DNS upsert failed (orphan secret: ${secretArn ?? secretId}):`,
        error,
      );
      const message = error instanceof Error ? error.message : 'Unknown error';
      const status = error instanceof GoDaddyAuthError ? 412 : 502;
      const hint =
        error instanceof GoDaddyAuthError
          ? 'Verify GoDaddy API credentials and that the production API tier is enabled.'
          : undefined;
      return NextResponse.json(
        {
          error: 'Failed to upsert DNS record',
          detail: message,
          orphanedSecret: secretId,
          ...(hint ? { hint } : {}),
        },
        { status },
      );
    }

    const mode: 'pr' | 'direct' = process.env.GITHUB_BRANCH_MODE === 'direct' ? 'direct' : 'pr';
    let changeset: ChangesetResult;
    try {
      changeset = await applyCreateWorldChangeset({
        org: input.org,
        world: input.world,
        env: input.env,
        files: generated.files.map((f) => ({ path: f.path, content: f.content })),
        parentKustomization: {
          path: generated.parentKustomizationPath,
          addEntry: generated.parentKustomizationEntry,
        },
        commitMessage: `feat(world): provision ${input.org}/${input.world} (${input.env})`,
        mode,
      });
    } catch (error) {
      console.error(
        `[api/worlds POST] git changeset failed (orphan secret: ${secretArn ?? secretId}, dns: ${
          dnsResult.skipped ? '(skipped)' : `${dnsResult.recordName}.${dnsResult.domain}`
        }):`,
        error,
      );
      const message = error instanceof Error ? error.message : 'Unknown error';
      return NextResponse.json(
        {
          error: 'Failed to push manifests',
          detail: message,
          orphanedSecret: secretId,
          orphanedDns: dnsResult.skipped
            ? null
            : `${dnsResult.recordName}.${dnsResult.domain}`,
        },
        { status: 502 },
      );
    }

    const helmReleaseName = deriveHelmReleaseName(input.world, input.env);
    const namespace = deriveNamespace(input.org, input.env);
    const hostname = deriveHostname(input.org, input.world, input.env);
    const assetsBaseUrl = deriveAssetsBaseUrl(input.org, input.world, input.env);

    let world;
    try {
      world = await prisma.world.create({
        data: {
          name: input.world,
          slug: input.world,
          organization: input.org,
          environment: dbEnv,
          status: WorldStatus.PROVISIONING,
          helmrelease_name: helmReleaseName,
          k8s_namespace: namespace,
          hostname,
          template_version: CHART_VERSION,
          github_pr_url: changeset.prUrl,
          github_pr_number: changeset.prNumber,
          description: input.description,
          owner_id: session.user.id,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          organization: true,
          environment: true,
          status: true,
          hostname: true,
          template_version: true,
          github_pr_url: true,
          github_pr_number: true,
          created_at: true,
        },
      });
    } catch (error) {
      console.error(
        `[api/worlds POST] DB persist failed (orphan PR: ${changeset.prUrl ?? changeset.commitSha}, secret: ${secretId}):`,
        error,
      );
      const message = error instanceof Error ? error.message : 'Unknown error';
      return NextResponse.json(
        {
          error: 'Provisioning succeeded externally but DB write failed',
          detail: message,
          orphanedSecret: secretId,
          orphanedPr: changeset.prUrl ?? changeset.commitSha,
        },
        { status: 500 },
      );
    }

    await prisma.auditLog.create({
      data: {
        action: 'CREATE',
        resource_type: 'WORLD',
        resource_id: world.id,
        world_id: world.id,
        user_id: session.user.id,
        user_email: session.user.email,
        details: {
          org: input.org,
          world: input.world,
          env: input.env,
          mode,
          pr_url: changeset.prUrl ?? null,
          commit_sha: changeset.commitSha ?? null,
          aws_secret_id: secretId,
          assets_base_url: assetsBaseUrl,
          assets_copied: assetsResult.copied,
          assets_dest_prefix: assetsResult.destPrefix,
          dns_skipped: dnsResult.skipped,
          dns_record: dnsResult.skipped
            ? null
            : `${dnsResult.recordName}.${dnsResult.domain}`,
        },
      },
    });

    const adminCode = payload.ADMIN_CODE;
    return NextResponse.json(
      {
        world,
        provisioning: {
          mode: changeset.mode,
          pr_url: changeset.prUrl ?? null,
          pr_number: changeset.prNumber ?? null,
          branch: changeset.branch,
          aws_secret_id: secretId,
          hostname,
          adminCode,
          assets: {
            copied: assetsResult.copied,
            envSegment: assetsResult.envSegment,
            destPrefix: assetsResult.destPrefix,
          },
          dns: dnsResult.skipped
            ? { skipped: true, reason: 'wildcard covers this org' }
            : {
                skipped: false,
                domain: dnsResult.domain,
                recordName: dnsResult.recordName,
                target: dnsResult.target,
              },
        },
      },
      { status: 201 },
    );
  });
}

const deleteWorldSchema = z.object({
  org: z.string().refine(isValidOrg, {
    message: `Unsupported org. Supported: ${getSupportedOrgs().join(', ')}`,
  }),
  world: z.string().refine(isValidWorldName, {
    message: 'World name must match ^[a-z][a-z0-9-]{1,28}[a-z0-9]$',
  }),
  env: z.enum(['pre', 'pro']),
});

export async function DELETE(request: Request) {
  return withAdmin(request, async (session) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = deleteWorldSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const { org, world, env } = parsed.data;

    const dbEnv: Environment = env === 'pre' ? Environment.PRE : Environment.PRO;
    const dbWorld = await prisma.world.findFirst({
      where: { organization: org, slug: world, environment: dbEnv },
      select: { id: true, status: true },
    });

    if (dbWorld) {
      await prisma.world.update({
        where: { id: dbWorld.id },
        data: { status: WorldStatus.DELETING },
      });
    }

    const paths = deriveWorldRepoPaths(org, world, env);
    const mode: 'pr' | 'direct' =
      process.env.GITHUB_BRANCH_MODE === 'direct' ? 'direct' : 'pr';

    let changeset: ChangesetResult;
    try {
      changeset = await applyDeleteWorldChangeset({
        org,
        world,
        env,
        pathsToDelete: [
          paths.worldFiles.configMap,
          paths.worldFiles.helmRelease,
          paths.worldFiles.kustomization,
        ],
        parentKustomization: {
          path: paths.parentKustomization,
          removeEntry: paths.parentEntry,
        },
        commitMessage: `chore(world): remove ${org}/${world} (${env})`,
        mode,
      });
    } catch (error) {
      console.error('[api/worlds DELETE] git changeset failed:', error);
      if (dbWorld) {
        await prisma.world
          .update({
            where: { id: dbWorld.id },
            data: { status: WorldStatus.ACTIVE },
          })
          .catch(() => undefined);
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      return NextResponse.json(
        { error: 'Failed to push delete changes', detail: message },
        { status: 502 },
      );
    }

    const secretId = deriveAwsSecretName(org, world, env);
    let secretDeleted = true;
    try {
      await deleteWorldSecret({ secretId, recoveryDays: 7 });
    } catch (error) {
      console.error('[api/worlds DELETE] secret delete failed:', error);
      secretDeleted = false;
    }

    let dnsDeleted = true;
    let dnsRecord: string | null = null;
    let dnsSkipped = false;
    try {
      const r = await deleteWorldCname({ org, world, env });
      dnsSkipped = r.skipped;
      dnsRecord = r.skipped ? null : `${r.recordName}.${r.domain}`;
    } catch (error) {
      console.error('[api/worlds DELETE] DNS delete failed:', error);
      dnsDeleted = false;
      if (error instanceof GoDaddyApiError || error instanceof GoDaddyAuthError) {
        dnsRecord = `${org}/${world}/${env} (see logs)`;
      }
    }

    if (dbWorld) {
      await prisma.world.delete({ where: { id: dbWorld.id } }).catch((err) => {
        console.error('[api/worlds DELETE] DB delete failed:', err);
      });
    }

    await prisma.auditLog.create({
      data: {
        action: 'DELETE',
        resource_type: 'WORLD',
        resource_id: dbWorld?.id ?? null,
        user_id: session.user.id,
        user_email: session.user.email,
        details: {
          org,
          world,
          env,
          mode,
          pr_url: changeset.prUrl ?? null,
          commit_sha: changeset.commitSha ?? null,
          aws_secret_id: secretId,
          aws_secret_deleted: secretDeleted,
          dns_skipped: dnsSkipped,
          dns_deleted: dnsDeleted,
          dns_record: dnsRecord,
          had_db_row: dbWorld !== null,
        },
      },
    });

    return NextResponse.json(
      {
        deleted: {
          mode: changeset.mode,
          pr_url: changeset.prUrl ?? null,
          pr_number: changeset.prNumber ?? null,
          branch: changeset.branch,
          aws_secret_id: secretId,
          aws_secret_deleted: secretDeleted,
          dns_skipped: dnsSkipped,
          dns_deleted: dnsDeleted,
          dns_record: dnsRecord,
          had_db_row: dbWorld !== null,
        },
      },
      { status: 200 },
    );
  });
}
