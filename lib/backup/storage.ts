/**
 * S3 destination for finished backup archives: a streaming multipart upload
 * (so a multi-GB zip never lands on the pod's disk) plus a presigned download
 * URL for handing the archive to the operator.
 *
 * Bucket/prefix are configurable; defaults reuse the assets bucket under a
 * `backups/` prefix. A lifecycle rule on that prefix (Phase 5) expires old zips.
 */
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PassThrough, type Readable } from 'node:stream';

import { ENGINE_COMMIT } from './render-artifacts';

const PREFIX = process.env.BACKUP_PREFIX ?? 'backups';

/** Days the S3 lifecycle keeps a backup archive before expiring it (Phase 5). */
export const BACKUP_LIFECYCLE_DAYS = 7;

/** Path of the bundled engine image inside the generated zip. */
export const ENGINE_IMAGE_ENTRY = 'engine/numinia-hyperfy2.tar.gz';

function getBucket(): string {
  const v = process.env.BACKUP_BUCKET ?? process.env.ASSETS_BUCKET ?? '';
  if (!v) throw new Error('BACKUP_BUCKET (or ASSETS_BUCKET) must be set');
  return v;
}

let clientInstance: S3Client | null = null;
function getClient(): S3Client {
  if (!clientInstance) {
    clientInstance = new S3Client({ region: process.env.AWS_REGION ?? 'eu-west-1' });
  }
  return clientInstance;
}

/** S3 key for a backup archive. Stable, keyed by job id so retries are idempotent. */
export function backupObjectKey(
  org: string,
  world: string,
  env: 'pre' | 'pro',
  jobId: string,
): string {
  return `${PREFIX}/${org}/${world}/${env}/${jobId}.zip`;
}

/** The filename the operator sees when downloading. */
export function backupDownloadFilename(org: string, world: string, env: 'pre' | 'pro'): string {
  return `mundo-${org}-${world}-${env}.zip`;
}

export interface BackupUpload {
  /** Writable stream — pipe the archive into this. */
  stream: PassThrough;
  /** Resolves when the multipart upload finishes (after the stream ends). */
  done: Promise<void>;
}

/** Open a streaming multipart upload to the backup bucket at `key`. */
export function startBackupUpload(key: string): BackupUpload {
  const stream = new PassThrough();
  const upload = new Upload({
    client: getClient(),
    params: {
      Bucket: getBucket(),
      Key: key,
      Body: stream,
      ContentType: 'application/zip',
    },
  });
  return { stream, done: upload.done().then(() => undefined) };
}

/**
 * S3 key of the pre-staged engine image tarball. Lives under a *separate*
 * top-level prefix (NOT `backups/`) so the backups lifecycle rule never expires
 * it. Commit-pinned so a new engine build is a new object. Stage it with
 * `deploy/stage-engine-image.sh`.
 */
export function engineImageKey(): string {
  return (
    process.env.BACKUP_ENGINE_IMAGE_KEY ?? `backup-engine/numinia-hyperfy2-${ENGINE_COMMIT}.tar.gz`
  );
}

export interface EngineImageObject {
  body: Readable;
  contentLength: number;
  key: string;
}

/**
 * Open a read stream over the staged engine image tarball, or `null` if it
 * hasn't been staged (missing key or no read access). Callers treat a null as
 * "skip the offline image" — the backup is still valid (pull/build-from-source
 * are documented), so a missing tar must never fail the whole job.
 */
export async function getEngineImageStream(): Promise<EngineImageObject | null> {
  const key = engineImageKey();
  try {
    const out = await getClient().send(new GetObjectCommand({ Bucket: getBucket(), Key: key }));
    return { body: out.Body as Readable, contentLength: out.ContentLength ?? 0, key };
  } catch (err) {
    const name = (err as { name?: string })?.name ?? '';
    if (['NoSuchKey', 'NotFound', 'AccessDenied', 'Forbidden'].includes(name)) return null;
    throw err;
  }
}

/** Presign a GET so the operator can download the archive without AWS creds. */
export async function presignBackupDownload(args: {
  key: string;
  filename: string;
  expiresInSeconds?: number;
}): Promise<string> {
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({
      Bucket: getBucket(),
      Key: args.key,
      ResponseContentDisposition: `attachment; filename="${args.filename}"`,
    }),
    { expiresIn: args.expiresInSeconds ?? 24 * 60 * 60 },
  );
}
