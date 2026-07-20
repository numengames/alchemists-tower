import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/api-auth';
import { BULK_SENTINEL_ORG, type BulkProgress } from '@/lib/backup/run-bulk-backup';
import {
  BACKUP_LIFECYCLE_DAYS,
  bulkBackupDownloadFilename,
  presignBackupDownload,
} from '@/lib/backup/storage';
import { prisma } from '@/lib/prisma';

const DOWNLOAD_TTL_SECONDS = 60 * 60;
const LIFECYCLE_MS = BACKUP_LIFECYCLE_DAYS * 24 * 60 * 60 * 1000;

/**
 * Status of an "all worlds" backup run, with a fresh presigned download URL for
 * the combined archive once COMPLETED. Admin-only: the URL exposes every
 * world's export. 404s for a non-bulk id so this can't be used to reach a
 * per-world job's download.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAdmin(request, async () => {
    const { id } = await params;
    const job = await prisma.backupJob.findUnique({ where: { id } });
    if (!job || job.organization !== BULK_SENTINEL_ORG) {
      return NextResponse.json({ error: 'Bulk backup job not found' }, { status: 404 });
    }

    let download: { url: string; expiresInSeconds: number } | null = null;
    if (job.status === 'COMPLETED' && job.object_key) {
      download = {
        url: await presignBackupDownload({
          key: job.object_key,
          filename: bulkBackupDownloadFilename(),
          expiresInSeconds: DOWNLOAD_TTL_SECONDS,
        }),
        expiresInSeconds: DOWNLOAD_TTL_SECONDS,
      };
    }

    return NextResponse.json({
      id: job.id,
      status: job.status,
      sizeBytes: job.size_bytes !== null ? Number(job.size_bytes) : null,
      progress: (job.db_rows as unknown as BulkProgress | null) ?? null,
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
