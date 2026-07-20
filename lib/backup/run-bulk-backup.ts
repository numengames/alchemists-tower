/**
 * Worker-side orchestration for "back up every world into one archive".
 *
 * The strategy is deliberately a *zip of zips*: each world is exported with the
 * exact same per-world pipeline as the single-world backup (so every inner zip
 * is self-contained and `docker compose up`-runnable), and those per-world zips
 * are then streamed — without recompression — into one combined archive.
 *
 * Two properties fall out of that design, both of which the operator asked for:
 *   1. Worlds that already have a *fresh* archive in S3 are reused, never
 *      rebuilt. "Fresh" = a COMPLETED BackupJob within the lifecycle window
 *      whose object still exists (HEAD-checked, because the lifecycle rule can
 *      delete the zip while the row lingers).
 *   2. Only the missing ones are generated, via {@link runWorldBackup}.
 *
 * Everything streams: at most one S3 object is open at a time and the combined
 * archive is multipart-uploaded straight to S3, so a fleet of multi-GB worlds
 * never lands on the pod's disk or in memory.
 */
import { ZipArchive, type Archiver } from 'archiver';
import type { Readable } from 'node:stream';

import { prisma } from '../prisma';
import type { WorldEnvironment } from '../world-templates';
import { Environment } from '@/generated/prisma/enums';
import { runWorldBackup } from './run-backup';
import {
  BACKUP_LIFECYCLE_DAYS,
  backupArchiveExists,
  bulkBackupObjectKey,
  getBackupArchiveStream,
  startBackupUpload,
} from './storage';

/** Sentinel org/world for the aggregate BackupJob row (orgs can't contain `_`). */
export const BULK_SENTINEL_ORG = '__all__';
export const BULK_SENTINEL_WORLD = '__all__';

const LIFECYCLE_MS = BACKUP_LIFECYCLE_DAYS * 24 * 60 * 60 * 1000;

export interface BulkWorldTarget {
  org: string;
  world: string;
  env: WorldEnvironment;
}

export type BulkWorldStatus = 'reused' | 'generated' | 'failed';

export interface BulkWorldOutcome extends BulkWorldTarget {
  status: BulkWorldStatus;
  /** S3 key of the per-world zip (present unless failed). */
  objectKey?: string;
  sizeBytes?: number;
  /** Failure reason (present only when failed). */
  error?: string;
}

export type BulkPhase = 'queued' | 'backing-up' | 'combining' | 'done';

/** Snapshot persisted to the sentinel BackupJob's `db_rows` for the UI to poll. */
export interface BulkProgress {
  kind: 'bulk';
  total: number;
  reused: number;
  generated: number;
  failed: number;
  /** Worlds processed so far (reused + generated + failed). */
  done: number;
  phase: BulkPhase;
  /** `org/world (env)` currently being processed, when phase is backing-up. */
  current: string | null;
  worlds: BulkWorldOutcome[];
}

export interface RunBulkBackupResult {
  objectKey: string;
  sizeBytes: number;
  total: number;
  reused: number;
  generated: number;
  failed: number;
  worlds: BulkWorldOutcome[];
}

export interface RunBulkBackupOptions {
  bulkJobId: string;
  targets: BulkWorldTarget[];
  requestedBy?: string;
  /** Called with a fresh snapshot after each world and on phase changes. */
  onProgress?: (progress: BulkProgress) => void | Promise<void>;
}

function toEnum(env: WorldEnvironment): Environment {
  return env === 'pre' ? Environment.PRE : Environment.PRO;
}

/** The name a per-world zip gets inside the combined archive. */
export function bulkEntryName(target: BulkWorldTarget): string {
  return `${target.org}-${target.world}-${target.env}.zip`;
}

function label(target: BulkWorldTarget): string {
  return `${target.org}/${target.world} (${target.env})`;
}

/** Append a stream and resolve once the archiver has fully consumed it. */
function appendStream(
  archive: Archiver,
  source: Readable,
  name: string,
  store = false,
): Promise<void> {
  return new Promise((resolve, reject) => {
    source.on('error', reject);
    archive.once('entry', () => resolve());
    archive.append(source, { name, store });
  });
}

/** Append in-memory content and resolve once the entry is written. */
function appendBuffer(archive: Archiver, content: string, name: string): Promise<void> {
  return new Promise((resolve) => {
    archive.once('entry', () => resolve());
    archive.append(Buffer.from(content), { name });
  });
}

/**
 * Reuse a fresh per-world archive if one exists, otherwise generate it. Never
 * throws: a world that can't be exported is reported as a `failed` outcome so
 * the bulk job keeps going and reports which worlds it couldn't include.
 */
export async function ensureWorldBackup(
  target: BulkWorldTarget,
  requestedBy?: string,
): Promise<BulkWorldOutcome> {
  const { org, world, env } = target;

  // 1. Reuse a still-alive archive from a recent COMPLETED job.
  const fresh = await prisma.backupJob.findFirst({
    where: {
      organization: org,
      world,
      environment: toEnum(env),
      status: 'COMPLETED',
      object_key: { not: null },
      completed_at: { gte: new Date(Date.now() - LIFECYCLE_MS) },
    },
    orderBy: { completed_at: 'desc' },
    select: { object_key: true, size_bytes: true },
  });
  if (fresh?.object_key && (await backupArchiveExists(fresh.object_key))) {
    return {
      ...target,
      status: 'reused',
      objectKey: fresh.object_key,
      sizeBytes: fresh.size_bytes !== null ? Number(fresh.size_bytes) : undefined,
    };
  }

  // 2. Generate a new per-world backup, tracked by its own BackupJob row so it
  //    shows up individually and can be reused by the next bulk run.
  const child = await prisma.backupJob.create({
    data: {
      organization: org,
      world,
      environment: toEnum(env),
      status: 'RUNNING',
      started_at: new Date(),
      requested_by: requestedBy,
    },
    select: { id: true },
  });

  try {
    const result = await runWorldBackup({ org, world, env, jobId: child.id });
    await prisma.backupJob.update({
      where: { id: child.id },
      data: {
        status: 'COMPLETED',
        object_key: result.objectKey,
        size_bytes: BigInt(result.sizeBytes),
        asset_files: result.assetFiles,
        db_rows: result.dbTables,
        completed_at: new Date(),
      },
    });
    return {
      ...target,
      status: 'generated',
      objectKey: result.objectKey,
      sizeBytes: result.sizeBytes,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[bulk-backup] ${label(target)} failed:`, err);
    await prisma.backupJob
      .update({
        where: { id: child.id },
        data: {
          status: 'FAILED',
          error_step: 'run',
          error_reason: reason,
          completed_at: new Date(),
        },
      })
      .catch(() => undefined);
    return { ...target, status: 'failed', error: reason };
  }
}

export async function runBulkBackup(opts: RunBulkBackupOptions): Promise<RunBulkBackupResult> {
  const { bulkJobId, targets, requestedBy } = opts;
  const emit = opts.onProgress ?? (() => {});

  const worlds: BulkWorldOutcome[] = [];
  const counts = () => ({
    reused: worlds.filter((w) => w.status === 'reused').length,
    generated: worlds.filter((w) => w.status === 'generated').length,
    failed: worlds.filter((w) => w.status === 'failed').length,
  });
  const snapshot = (phase: BulkPhase, current: string | null): BulkProgress => ({
    kind: 'bulk',
    total: targets.length,
    ...counts(),
    done: worlds.length,
    phase,
    current,
    worlds,
  });

  // Phase 1: reuse-or-generate each world, one at a time.
  for (const target of targets) {
    await emit(snapshot('backing-up', label(target)));
    worlds.push(await ensureWorldBackup(target, requestedBy));
    await emit(snapshot('backing-up', null));
  }

  const succeeded = worlds.filter((w) => w.objectKey);
  if (succeeded.length === 0) {
    throw new Error(
      `No worlds could be backed up (${worlds.length} attempted, all failed). ` +
        `First error: ${worlds.find((w) => w.error)?.error ?? 'unknown'}`,
    );
  }

  // Phase 2: stream every per-world zip into the combined archive. `store: true`
  // skips recompression — the inner entries are already-compressed zips.
  await emit(snapshot('combining', null));
  const objectKey = bulkBackupObjectKey(bulkJobId);
  const { stream: s3Stream, done } = startBackupUpload(objectKey);
  const archive: Archiver = new ZipArchive({ zlib: { level: 0 } });
  const archiveErr = new Promise<never>((_, reject) => archive.on('error', reject));
  archive.pipe(s3Stream);

  const manifest = {
    exportedAt: new Date().toISOString(),
    total: targets.length,
    ...counts(),
    worlds: worlds.map((w) => ({
      org: w.org,
      world: w.world,
      env: w.env,
      status: w.status,
      entry: w.objectKey ? bulkEntryName(w) : null,
      error: w.error ?? null,
    })),
  };
  await Promise.race([
    appendBuffer(archive, JSON.stringify(manifest, null, 2), 'manifest.json'),
    archiveErr,
  ]);

  for (const w of succeeded) {
    const { body } = await getBackupArchiveStream(w.objectKey!);
    await Promise.race([appendStream(archive, body, bulkEntryName(w), true), archiveErr]);
  }

  await archive.finalize();
  await Promise.race([done, archiveErr]);

  await emit(snapshot('done', null));

  const c = counts();
  return {
    objectKey,
    sizeBytes: archive.pointer(),
    total: targets.length,
    reused: c.reused,
    generated: c.generated,
    failed: c.failed,
    worlds,
  };
}
