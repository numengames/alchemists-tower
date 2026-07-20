/**
 * pg-boss queue for backup jobs, backed by the backoffice's own Postgres (no
 * Redis, no extra infra). The HTTP route enqueues; an in-pod worker (started
 * from instrumentation) drains the queue and runs the heavy export. Knative
 * keeps one pod warm (minScale=1), and pg-boss locks jobs, so a second replica
 * never double-processes.
 *
 * `getBoss()` is a lazily-started singleton; importing this module does NOT
 * connect (so `next build` stays offline). Callers await the first real use.
 */
import { PgBoss } from 'pg-boss';

import { prisma } from '../prisma';
import { Prisma } from '@/generated/prisma/client';
import type { WorldEnvironment } from '../world-templates';
import { runWorldBackup } from './run-backup';
import { runBulkBackup, type BulkProgress, type BulkWorldTarget } from './run-bulk-backup';

const QUEUE = 'world-backup';
const BULK_QUEUE = 'world-backup-all';

export interface BackupJobPayload {
  /** BackupJob.id in the backoffice DB. */
  jobId: string;
  org: string;
  world: string;
  env: WorldEnvironment;
}

export interface BulkBackupJobPayload {
  /** The aggregate (sentinel) BackupJob.id that tracks the whole run. */
  bulkJobId: string;
  targets: BulkWorldTarget[];
  requestedBy?: string;
}

let bossPromise: Promise<PgBoss> | null = null;

async function getBoss(): Promise<PgBoss> {
  if (bossPromise) return bossPromise;
  bossPromise = (async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is required for the backup queue');
    const boss = new PgBoss({ connectionString });
    boss.on('error', (err) => console.error('[pg-boss] error', err));
    await boss.start();
    for (const q of [QUEUE, BULK_QUEUE]) {
      try {
        await boss.createQueue(q);
      } catch {
        // Queue already exists — fine.
      }
    }
    return boss;
  })();
  return bossPromise;
}

/**
 * Enqueue a backup. The BackupJob row must already exist (status QUEUED).
 * Returns false when pg-boss rejected the send as a duplicate: the singleton
 * key allows at most one queued-or-active job per org/world/env, closing the
 * race window between two concurrent POSTs.
 */
export async function enqueueBackupJob(payload: BackupJobPayload): Promise<boolean> {
  const boss = await getBoss();
  const id = await boss.send(QUEUE, payload, {
    retryLimit: 1,
    expireInSeconds: 6 * 60 * 60,
    singletonKey: `${payload.org}/${payload.world}/${payload.env}`,
  });
  return id !== null;
}

/**
 * Enqueue a "back up every world" run. The aggregate BackupJob row must already
 * exist (status QUEUED). The singleton key allows at most one bulk run at a
 * time (it's expensive and touches every world) and returns false if one is
 * already queued/active. No auto-retry: a bulk failure is surfaced to the
 * operator to re-trigger, and reuse-detection makes a re-run cheap anyway.
 */
export async function enqueueBulkBackup(payload: BulkBackupJobPayload): Promise<boolean> {
  const boss = await getBoss();
  const id = await boss.send(BULK_QUEUE, payload, {
    retryLimit: 0,
    expireInSeconds: 12 * 60 * 60,
    singletonKey: 'all-worlds',
  });
  return id !== null;
}

/**
 * Start the in-pod worker. Idempotent enough for a single process; call once
 * from instrumentation. Each job transitions the BackupJob row through
 * RUNNING -> COMPLETED/FAILED and persists the result.
 */
export async function startBackupWorker(): Promise<void> {
  const boss = await getBoss();
  await boss.work<BackupJobPayload>(QUEUE, async (jobs) => {
    for (const job of jobs) {
      await handleBackup(job.data);
    }
  });
  await boss.work<BulkBackupJobPayload>(BULK_QUEUE, async (jobs) => {
    for (const job of jobs) {
      await handleBulkBackup(job.data);
    }
  });
  console.log('[pg-boss] backup worker started');
}

async function handleBackup(payload: BackupJobPayload): Promise<void> {
  const { jobId, org, world, env } = payload;

  await prisma.backupJob.update({
    where: { id: jobId },
    data: { status: 'RUNNING', started_at: new Date() },
  });

  try {
    const result = await runWorldBackup({ org, world, env, jobId });
    await prisma.backupJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        object_key: result.objectKey,
        size_bytes: BigInt(result.sizeBytes),
        asset_files: result.assetFiles,
        db_rows: result.dbTables,
        completed_at: new Date(),
      },
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[pg-boss] backup ${jobId} failed:`, err);
    await prisma.backupJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        error_step: 'run',
        error_reason: reason,
        completed_at: new Date(),
      },
    });
    throw err; // surface to pg-boss for its retry/record-keeping
  }
}

/** Persist a progress snapshot onto the sentinel row's `db_rows`. Best-effort. */
function persistBulkProgress(bulkJobId: string, progress: BulkProgress): Promise<void> {
  return prisma.backupJob
    .update({
      where: { id: bulkJobId },
      data: { db_rows: progress as unknown as Prisma.InputJsonValue },
    })
    .then(() => undefined)
    .catch((err) => console.error('[pg-boss] bulk progress persist failed:', err));
}

async function handleBulkBackup(payload: BulkBackupJobPayload): Promise<void> {
  const { bulkJobId, targets, requestedBy } = payload;

  await prisma.backupJob.update({
    where: { id: bulkJobId },
    data: { status: 'RUNNING', started_at: new Date() },
  });

  try {
    const result = await runBulkBackup({
      bulkJobId,
      targets,
      requestedBy,
      onProgress: (p) => persistBulkProgress(bulkJobId, p),
    });
    await prisma.backupJob.update({
      where: { id: bulkJobId },
      data: {
        status: 'COMPLETED',
        object_key: result.objectKey,
        size_bytes: BigInt(result.sizeBytes),
        db_rows: {
          kind: 'bulk',
          total: result.total,
          reused: result.reused,
          generated: result.generated,
          failed: result.failed,
          done: result.total,
          phase: 'done',
          current: null,
          worlds: result.worlds,
        } as unknown as Prisma.InputJsonValue,
        completed_at: new Date(),
      },
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[pg-boss] bulk backup ${bulkJobId} failed:`, err);
    await prisma.backupJob.update({
      where: { id: bulkJobId },
      data: {
        status: 'FAILED',
        error_step: 'bulk-run',
        error_reason: reason,
        completed_at: new Date(),
      },
    });
    throw err;
  }
}
