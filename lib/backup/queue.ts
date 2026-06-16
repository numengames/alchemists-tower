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
import type { WorldEnvironment } from '../world-templates';
import { runWorldBackup } from './run-backup';

const QUEUE = 'world-backup';

export interface BackupJobPayload {
  /** BackupJob.id in the backoffice DB. */
  jobId: string;
  org: string;
  world: string;
  env: WorldEnvironment;
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
    try {
      await boss.createQueue(QUEUE);
    } catch {
      // Queue already exists — fine.
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
