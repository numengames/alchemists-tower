import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import {
  BACKUP_LIFECYCLE_DAYS,
  backupDownloadFilename,
  presignBackupDownload,
} from '@/lib/backup/storage';

const DOWNLOAD_TTL_SECONDS = 60 * 60;
const LIFECYCLE_MS = BACKUP_LIFECYCLE_DAYS * 24 * 60 * 60 * 1000;

/**
 * Backup job status. When COMPLETED, returns a short-lived presigned download
 * URL for the archive. Admin-only: the URL exposes the full world export
 * (including its .env), so it must match the POST's privilege level.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAdmin(request, async () => {
    const { id } = await params;
    const job = await prisma.backupJob.findUnique({ where: { id } });
    if (!job) {
      return NextResponse.json({ error: 'Backup job not found' }, { status: 404 });
    }

    const env = job.environment === 'PRE' ? 'pre' : 'pro';
    let download: { url: string; expiresInSeconds: number } | null = null;
    if (job.status === 'COMPLETED' && job.object_key) {
      download = {
        url: await presignBackupDownload({
          key: job.object_key,
          filename: backupDownloadFilename(job.organization, job.world, env),
          expiresInSeconds: DOWNLOAD_TTL_SECONDS,
        }),
        expiresInSeconds: DOWNLOAD_TTL_SECONDS,
      };
    }

    return NextResponse.json({
      id: job.id,
      status: job.status,
      org: job.organization,
      world: job.world,
      environment: env,
      sizeBytes: job.size_bytes !== null ? Number(job.size_bytes) : null,
      assetFiles: job.asset_files,
      dbRows: job.db_rows,
      error: job.error_reason,
      createdAt: job.created_at,
      startedAt: job.started_at,
      completedAt: job.completed_at,
      archiveExpiresAt:
        job.status === 'COMPLETED' && job.completed_at
          ? new Date(job.completed_at.getTime() + LIFECYCLE_MS).toISOString()
          : null,
      download,
    });
  });
}
