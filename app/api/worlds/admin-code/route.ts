import { NextResponse } from 'next/server';
import { z } from 'zod';

import { withAdmin } from '@/lib/api-auth';
import { readWorldSecretKey } from '@/lib/aws-secrets';
import { prisma } from '@/lib/prisma';
import {
  deriveAwsSecretName,
  isValidOrg,
  isValidWorldName,
} from '@/lib/world-templates';

const querySchema = z.object({
  org: z.string().refine(isValidOrg, { message: 'Unsupported org' }),
  world: z
    .string()
    .refine(isValidWorldName, { message: 'Invalid world name' }),
  env: z.enum(['pre', 'pro']),
});

export async function GET(request: Request) {
  return withAdmin(request, async (session) => {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      org: url.searchParams.get('org') ?? '',
      world: url.searchParams.get('world') ?? '',
      env: url.searchParams.get('env') ?? '',
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const { org, world, env } = parsed.data;
    const secretId = deriveAwsSecretName(org, world, env);

    let adminCode: string | null;
    try {
      adminCode = await readWorldSecretKey(secretId, 'ADMIN_CODE');
    } catch (error) {
      console.error('[api/worlds/admin-code] read failed:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return NextResponse.json(
        { error: 'Failed to read secret', detail: message },
        { status: 502 },
      );
    }

    if (!adminCode) {
      return NextResponse.json(
        { error: 'Admin code not found in secret', secretId },
        { status: 404 },
      );
    }

    await prisma.auditLog.create({
      data: {
        action: 'UPDATE',
        resource_type: 'WORLD',
        resource_id: null,
        user_id: session.user.id,
        user_email: session.user.email,
        details: {
          op: 'read_admin_code',
          org,
          world,
          env,
          aws_secret_id: secretId,
        },
      },
    });

    return NextResponse.json({ adminCode, org, world, env });
  });
}
