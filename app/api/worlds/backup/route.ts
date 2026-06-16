import { NextResponse } from 'next/server';
import { z } from 'zod';

import { withAdmin } from '@/lib/api-auth';
import { enqueueBackupJob } from '@/lib/backup/queue';
import { prisma } from '@/lib/prisma';
import { isValidOrg, isValidWorldName } from '@/lib/world-templates';
import {
  BACKUP_LIFECYCLE_DAYS,
  backupDownloadFilename,
  presignBackupDownload,
} from '@/lib/backup/storage';
import { Environment } from '@/generated/prisma/enums';

const DOWNLOAD_TTL_SECONDS = 60 * 60;
const ACTIVE_WINDOW_MS = 6 * 60 * 60 * 1000;
// Matches the S3 lifecycle on the `backups/` prefix: archives older than this
// have been expired, so we must not offer a (dead) download link for them.
const LIFECYCLE_MS = BACKUP_LIFECYCLE_DAYS * 24 * 60 * 60 * 1000;

const QuerySchema = z.object({
  org: z.string(),
  world: z.string(),
  env: z.enum(['pre', 'pro']),
});

/**
 * Latest backup for one world, so the modal can resume an in-flight job or offer
 * the existing archive instead of starting a redundant new one. Returns the
 * active job (QUEUED/RUNNING) if any, else the most recent COMPLETED job whose
 * archive is still within the lifecycle window (with a presigned download URL),
 * else `{ job: null }`. Admin-only — the download URL exposes the full export.
 */
export async function GET(request: Request) {
  return withAdmin(request, async () => {
    const url = new URL(request.url);
    const parsed = QuerySchema.safeParse({
      org: url.searchParams.get('org'),
      world: url.searchParams.get('world'),
      env: url.searchParams.get('env'),
    });
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query parameters' }, { status: 400 });
    }
    const { org, world, env } = parsed.data;
    if (!isValidOrg(org) || !isValidWorldName(world)) {
      return NextResponse.json({ job: null });
    }
    const environment = env === 'pre' ? Environment.PRE : Environment.PRO;

    // Prefer an in-flight job so the modal re-attaches to its live progress.
    const active = await prisma.backupJob.findFirst({
      where: {
        organization: org,
        world,
        environment,
        status: { in: ['QUEUED', 'RUNNING'] },
        created_at: { gte: new Date(Date.now() - ACTIVE_WINDOW_MS) },
      },
      orderBy: { created_at: 'desc' },
    });

    const job =
      active ??
      (await prisma.backupJob.findFirst({
        where: {
          organization: org,
          world,
          environment,
          status: 'COMPLETED',
          object_key: { not: null },
          completed_at: { gte: new Date(Date.now() - LIFECYCLE_MS) },
        },
        orderBy: { completed_at: 'desc' },
      }));

    if (!job) {
      return NextResponse.json({ job: null });
    }

    let download: { url: string; expiresInSeconds: number } | null = null;
    if (job.status === 'COMPLETED' && job.object_key) {
      download = {
        url: await presignBackupDownload({
          key: job.object_key,
          filename: backupDownloadFilename(org, world, env),
          expiresInSeconds: DOWNLOAD_TTL_SECONDS,
        }),
        expiresInSeconds: DOWNLOAD_TTL_SECONDS,
      };
    }

    return NextResponse.json({
      job: {
        id: job.id,
        status: job.status,
        sizeBytes: job.size_bytes !== null ? Number(job.size_bytes) : null,
        assetFiles: job.asset_files,
        error: job.error_reason,
        download,
        archiveExpiresAt:
          job.status === 'COMPLETED' && job.completed_at
            ? new Date(job.completed_at.getTime() + LIFECYCLE_MS).toISOString()
            : null,
      },
    });
  });
}

const BodySchema = z.object({
  org: z.string(),
  world: z.string(),
  env: z.enum(['pre', 'pro']),
});

/**
 * Enqueue a backup for one world. Creates a BackupJob row (QUEUED), hands the id
 * to pg-boss, and returns immediately — the in-pod worker does the heavy export.
 * Poll `GET /api/worlds/backup/{id}` for status + download URL.
 */
export async function POST(request: Request) {
  return withAdmin(request, async (session) => {
    let body: z.infer<typeof BodySchema>;
    try {
      body = BodySchema.parse(await request.json());
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    if (!isValidOrg(body.org)) {
      return NextResponse.json({ error: `Unsupported org "${body.org}"` }, { status: 400 });
    }
    if (!isValidWorldName(body.world)) {
      return NextResponse.json({ error: `Invalid world name "${body.world}"` }, { status: 400 });
    }

    const environment = body.env === 'pre' ? Environment.PRE : Environment.PRO;

    // One backup per world at a time. The time bound matches the queue's
    // expireInSeconds, so a row orphaned by a hard pod kill (stuck RUNNING)
    // can't block backups forever.
    const existing = await prisma.backupJob.findFirst({
      where: {
        organization: body.org,
        world: body.world,
        environment,
        status: { in: ['QUEUED', 'RUNNING'] },
        created_at: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
      },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'A backup for this world is already in progress', jobId: existing.id },
        { status: 409 },
      );
    }

    const job = await prisma.backupJob.create({
      data: {
        organization: body.org,
        world: body.world,
        environment,
        status: 'QUEUED',
        requested_by: session.user.id,
      },
    });

    let enqueued: boolean;
    try {
      enqueued = await enqueueBackupJob({
        jobId: job.id,
        org: body.org,
        world: body.world,
        env: body.env,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Unknown error';
      await prisma.backupJob.update({
        where: { id: job.id },
        data: { status: 'FAILED', error_step: 'enqueue', error_reason: reason },
      });
      return NextResponse.json(
        { error: 'Failed to enqueue backup', detail: reason },
        { status: 500 },
      );
    }
    if (!enqueued) {
      // pg-boss singleton rejected the send: a concurrent request won the race.
      await prisma.backupJob.delete({ where: { id: job.id } });
      return NextResponse.json(
        { error: 'A backup for this world is already in progress' },
        { status: 409 },
      );
    }

    await prisma.auditLog.create({
      data: {
        action: 'CREATE',
        resource_type: 'WORLD',
        resource_id: job.id,
        user_id: session.user.id,
        user_email: session.user.email,
        details: { backup: true, org: body.org, world: body.world, env: body.env, jobId: job.id },
      },
    });

    return NextResponse.json({ jobId: job.id, status: 'QUEUED' }, { status: 202 });
  });
}
