/**
 * Download a world's S3 assets to a local directory, reproducing the layout the
 * hyperfy2 engine expects under `world/` when run with ASSETS=local.
 *
 * The world prefix in S3 is `…/{org}/{world}/{seg}/` and contains `assets/…`;
 * stripping the prefix yields `assets/<hash>.<ext>`, which we write verbatim
 * into the destination `world/` folder. Asset filenames are content hashes and
 * identical across the S3 and filesystem backends, so the copy is 1:1.
 *
 * Objects are streamed straight to disk (never fully buffered), so a multi-GB
 * world downloads within a small, bounded memory footprint.
 */
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';

import { getAssetObjectStream, listWorldAssetKeys } from '../s3-assets';

/**
 * Compute the on-disk path (relative to the world dir) for an S3 key, by
 * stripping the shared world prefix. Throws if the key doesn't belong to the
 * prefix, which would indicate a listing/derivation mismatch.
 */
export function relativePathForKey(prefix: string, key: string): string {
  if (!key.startsWith(prefix)) {
    throw new Error(`Key "${key}" is not under prefix "${prefix}"`);
  }
  return key.slice(prefix.length);
}

export interface DownloadProgress {
  /** Files written so far. */
  files: number;
  /** Total files to write. */
  total: number;
  /** Bytes written so far. */
  bytes: number;
  /** The relative path just written. */
  lastPath: string;
}

export interface DownloadWorldAssetsResult {
  files: number;
  bytes: number;
}

/**
 * Download every asset of a world into `destDir` (the local `world/` folder).
 * Returns counts. Concurrency bounds how many objects stream in parallel.
 */
export async function downloadWorldAssets(args: {
  org: string;
  world: string;
  env: 'pre' | 'pro';
  destDir: string;
  concurrency?: number;
  onProgress?: (p: DownloadProgress) => void;
}): Promise<DownloadWorldAssetsResult> {
  const { org, world, env, destDir, onProgress } = args;
  const concurrency = Math.max(1, args.concurrency ?? 8);

  const { prefix, keys } = await listWorldAssetKeys({ org, world, env });

  let files = 0;
  let bytes = 0;
  const total = keys.length;
  const queue = [...keys];

  const worker = async () => {
    for (;;) {
      const key = queue.shift();
      if (!key) return;
      const rel = relativePathForKey(prefix, key);
      const dest = join(destDir, rel);
      await mkdir(dirname(dest), { recursive: true });

      const { body, contentLength } = await getAssetObjectStream(key);
      await pipeline(body, createWriteStream(dest));

      files += 1;
      bytes += contentLength;
      onProgress?.({ files, total, bytes, lastPath: rel });
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));

  return { files, bytes };
}
