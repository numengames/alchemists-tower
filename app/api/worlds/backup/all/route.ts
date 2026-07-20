import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/api-auth';
import { enqueueBulkBackup } from '@/lib/backup/queue';
import {
  BULK_SENTINEL_ORG,
  BULK_SENTINEL_WORLD,
  type BulkProgress,
  type BulkWorldTarget,
} from '@/lib/backup/run-bulk-backup';
import {
  BACKUP_LIFECYCLE_DAYS,
  bulkBackupDownloadFilename,
  presignBackupDownload,
} from '@/lib/backup/storage';
import { listWorlds } from '@/lib/k8s';
import { prisma } from '@/lib/prisma';
import { Environment } from '@/generated/prisma/enums';
import { Prisma } from '@/generated/prisma/client';

const DOWNLOAD_TTL_SECONDS = 60 * 60;
// Matches enqueueBulkBackup's expireInSeconds: a row orphaned by a hard pod
// kill (stuck RUNNING) can't block new bulk runs forever.
const ACTIVE_WINDOW_MS = 12 * 60 * 60 * 1000;
const LIFECYCLE_MS = BACKUP_LIFECYCLE_DAYS * 24 * 60 * 60 * 1000;

const SENTINEL_WHERE = {
  organization: BULK_SENTINEL_ORG,
  world: BULK_SENTINEL_WORLD,
} as const;

/** Shape the aggregate BackupJob row into the payload the modal consumes. */
async function serializeBulkJob(job: {
  id: string;
  status: string;
  object_key: string | null;
  size_bytes: bigint | null;
  db_rows: Prisma.JsonValue | null;
  error_reason: string | null;
  completed_at: Date | null;
}) {
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
  return {
    id: job.id,
    status: job.status,
    sizeBytes: job.size_bytes !== null ? Number(job.size_bytes) : null,
    progress: (job.db_rows as unknown as BulkProgress | null) ?? null,
    error: job.error_reason,
    download,
    archiveExpiresAt:
      job.status === 'COMPLETED' && job.completed_at
        ? new Date(job.completed_at.getTime() + LIFECYCLE_MS).toISOString()
        : null,
  };
}

/**
 * Latest "all worlds" backup, so the modal can re-attach to a running run or
 * surface the existing combined archive instead of starting a redundant one.
 * Admin-only — the download URL exposes every world's export.
 */
export async function GET(request: Request) {
  return withAdmin(request, async () => {
    const active = await prisma.backupJob.findFirst({
      where: {
        ...SENTINEL_WHERE,
        status: { in: ['QUEUED', 'RUNNING'] },
        created_at: { gte: new Date(Date.now() - ACTIVE_WINDOW_MS) },
      },
      orderBy: { created_at: 'desc' },
    });

    const job =
      active ??
      (await prisma.backupJob.findFirst({
        where: {
          ...SENTINEL_WHERE,
          status: 'COMPLETED',
          object_key: { not: null },
          completed_at: { gte: new Date(Date.now() - LIFECYCLE_MS) },
        },
        orderBy: { completed_at: 'desc' },
      }));

    if (!job) return NextResponse.json({ job: null });
    return NextResponse.json({ job: await serializeBulkJob(job) });
  });
}

/**
 * Start a "back up every world" run. Enumerates the live worlds, creates the
 * aggregate BackupJob row (QUEUED), and hands it to the in-pod worker, which
 * reuses fresh per-world archives and only generates the missing ones before
 * combining everything into one zip. Poll `GET .../all/{id}` for progress.
 */
export async function POST(request: Request) {
  return withAdmin(request, async (session) => {
    let worlds;
    try {
      worlds = await listWorlds();
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Unknown error';
      return NextResponse.json(
        { error: 'Could not list worlds from the cluster', detail },
        { status: 502 },
      );
    }

    const targets: BulkWorldTarget[] = worlds.map((w) => ({
      org: w.organization,
      world: w.worldName,
      env: w.environment,
    }));
    if (targets.length === 0) {
      return NextResponse.json({ error: 'No worlds found to back up' }, { status: 400 });
    }

    // One bulk run at a time — it touches every world and is expensive.
    const existing = await prisma.backupJob.findFirst({
      where: {
        ...SENTINEL_WHERE,
        status: { in: ['QUEUED', 'RUNNING'] },
        created_at: { gte: new Date(Date.now() - ACTIVE_WINDOW_MS) },
      },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'A full backup is already in progress', jobId: existing.id },
        { status: 409 },
      );
    }

    const initialProgress: BulkProgress = {
      kind: 'bulk',
      total: targets.length,
      reused: 0,
      generated: 0,
      failed: 0,
      done: 0,
      phase: 'queued',
      current: null,
      worlds: [],
    };

    const job = await prisma.backupJob.create({
      data: {
        organization: BULK_SENTINEL_ORG,
        world: BULK_SENTINEL_WORLD,
        environment: Environment.PRO, // arbitrary; the sentinel spans both envs
        status: 'QUEUED',
        requested_by: session.user.id,
        db_rows: initialProgress as unknown as Prisma.InputJsonValue,
      },
    });

    let enqueued: boolean;
    try {
      enqueued = await enqueueBulkBackup({
        bulkJobId: job.id,
        targets,
        requestedBy: session.user.id,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Unknown error';
      await prisma.backupJob.update({
        where: { id: job.id },
        data: { status: 'FAILED', error_step: 'enqueue', error_reason: reason },
      });
      return NextResponse.json(
        { error: 'Failed to enqueue full backup', detail: reason },
        { status: 500 },
      );
    }
    if (!enqueued) {
      await prisma.backupJob.delete({ where: { id: job.id } });
      return NextResponse.json({ error: 'A full backup is already in progress' }, { status: 409 });
    }

    await prisma.auditLog.create({
      data: {
        action: 'CREATE',
        resource_type: 'WORLD',
        resource_id: job.id,
        user_id: session.user.id,
        user_email: session.user.email,
        details: { backupAll: true, jobId: job.id, worlds: targets.length },
      },
    });

    return NextResponse.json(
      { jobId: job.id, status: 'QUEUED', total: targets.length },
      { status: 202 },
    );
  });
}
