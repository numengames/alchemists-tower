/**
 * S3 helpers for the world-asset folder lifecycle. Copies the template tree
 * under `<TEMPLATE_PREFIX>/<env-segment>/` into the new world's prefix using
 * server-side `CopyObject` (no bytes leave AWS).
 *
 * Configuration via env (with defaults preserved):
 *   - ASSETS_BUCKET            (default: read from process.env)
 *   - ASSETS_ROOT_PREFIX       (default: 'hyperfy-spaces')
 *   - ASSETS_TEMPLATE_PREFIX   (default: '<root>/_default')
 */
import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';

function getBucket(): string {
  const v = process.env.ASSETS_BUCKET ?? '';
  if (!v) throw new Error('ASSETS_BUCKET must be set in the environment');
  return v;
}
const ROOT_PREFIX = process.env.ASSETS_ROOT_PREFIX ?? 'hyperfy-spaces';
const TEMPLATE_PREFIX =
  process.env.ASSETS_TEMPLATE_PREFIX ?? `${ROOT_PREFIX}/_default`;
const COPY_CONCURRENCY = 8;

let clientInstance: S3Client | null = null;

function getClient(): S3Client {
  if (clientInstance) return clientInstance;
  clientInstance = new S3Client({
    region: process.env.AWS_REGION ?? 'eu-west-1',
  });
  return clientInstance;
}

export class S3TemplateMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'S3TemplateMissingError';
  }
}

export function envToAssetsSegment(env: 'pre' | 'pro'): 'dev' | 'latest' {
  return env === 'pre' ? 'dev' : 'latest';
}

/** URL-encodes a key for `CopySource`, preserving slashes between segments. */
function encodeCopySource(bucket: string, key: string): string {
  const encodedKey = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `/${bucket}/${encodedKey}`;
}

async function listAllKeys(prefix: string): Promise<string[]> {
  const client = getClient();
  const bucket = getBucket();
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const out = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    for (const obj of out.Contents ?? []) {
      if (obj.Key && !obj.Key.endsWith('/')) keys.push(obj.Key);
    }
    continuationToken = out.IsTruncated ? out.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

export interface CopyDefaultAssetsResult {
  copied: number;
  envSegment: 'dev' | 'latest';
  destPrefix: string;
}

/**
 * Copy every object under the env-segmented template prefix to the new
 * world's prefix. Throws `S3TemplateMissingError` if the template is empty.
 */
export async function copyDefaultAssets(args: {
  org: string;
  world: string;
  env: 'pre' | 'pro';
}): Promise<CopyDefaultAssetsResult> {
  const { org, world, env } = args;
  const bucket = getBucket();
  const envSegment = envToAssetsSegment(env);
  const sourcePrefix = `${TEMPLATE_PREFIX}/${envSegment}/`;
  const destPrefix = `${ROOT_PREFIX}/${org}/${world}/${envSegment}/`;

  const sourceKeys = await listAllKeys(sourcePrefix);
  if (sourceKeys.length === 0) {
    throw new S3TemplateMissingError(
      `No template assets found at s3://${bucket}/${sourcePrefix}`,
    );
  }

  const client = getClient();
  const queue = [...sourceKeys];
  let copied = 0;

  const workers = Array.from(
    { length: Math.min(COPY_CONCURRENCY, queue.length) },
    async () => {
      while (queue.length > 0) {
        const sourceKey = queue.shift();
        if (!sourceKey) return;
        const destKey = destPrefix + sourceKey.slice(sourcePrefix.length);
        await client.send(
          new CopyObjectCommand({
            Bucket: bucket,
            CopySource: encodeCopySource(bucket, sourceKey),
            Key: destKey,
          }),
        );
        copied += 1;
      }
    },
  );
  await Promise.all(workers);

  return { copied, envSegment, destPrefix };
}

export interface DeleteWorldAssetsResult {
  deleted: number;
  envSegment: 'dev' | 'latest';
  prefix: string;
}

/**
 * Recursively delete every object under the world's env-segmented prefix.
 * Returns silently when the prefix is already empty. Tolerates partial
 * batch failures by surfacing the first error encountered.
 */
export async function deleteWorldAssets(args: {
  org: string;
  world: string;
  env: 'pre' | 'pro';
}): Promise<DeleteWorldAssetsResult> {
  const { org, world, env } = args;
  const bucket = getBucket();
  const envSegment = envToAssetsSegment(env);
  const prefix = `${ROOT_PREFIX}/${org}/${world}/${envSegment}/`;

  const keys = await listAllKeys(prefix);
  if (keys.length === 0) {
    return { deleted: 0, envSegment, prefix };
  }

  const client = getClient();
  // S3 DeleteObjects accepts up to 1000 keys per call.
  const BATCH = 1000;
  let deleted = 0;
  for (let i = 0; i < keys.length; i += BATCH) {
    const chunk = keys.slice(i, i + BATCH);
    const out = await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: chunk.map((Key) => ({ Key })),
          Quiet: true,
        },
      }),
    );
    if (out.Errors && out.Errors.length > 0) {
      const first = out.Errors[0];
      throw new Error(
        `S3 delete reported ${out.Errors.length} error(s); first: ${first.Code} ${first.Message ?? ''} on ${first.Key ?? '?'}`,
      );
    }
    deleted += chunk.length;
  }

  return { deleted, envSegment, prefix };
}

/** The S3 prefix that holds a world's assets, e.g. `hyperfy-spaces/org/world/latest/`. */
export function deriveWorldAssetsPrefix(args: {
  org: string;
  world: string;
  env: 'pre' | 'pro';
}): string {
  const { org, world, env } = args;
  return `${ROOT_PREFIX}/${org}/${world}/${envToAssetsSegment(env)}/`;
}

export interface WorldAssetKeys {
  /** The shared prefix every key starts with (for relative-path math). */
  prefix: string;
  /** Every object key under the world prefix (excludes folder placeholders). */
  keys: string[];
}

/** List every asset object key for a world. Empty `keys` is a valid result. */
export async function listWorldAssetKeys(args: {
  org: string;
  world: string;
  env: 'pre' | 'pro';
}): Promise<WorldAssetKeys> {
  const prefix = deriveWorldAssetsPrefix(args);
  const keys = await listAllKeys(prefix);
  return { prefix, keys };
}

export interface AssetObject {
  body: Readable;
  contentLength: number;
}

/** Open a single S3 object for streaming download. */
export async function getAssetObjectStream(key: string): Promise<AssetObject> {
  const out = await getClient().send(
    new GetObjectCommand({ Bucket: getBucket(), Key: key }),
  );
  if (!out.Body) {
    throw new Error(`S3 object has no body: ${key}`);
  }
  return { body: out.Body as Readable, contentLength: out.ContentLength ?? 0 };
}
