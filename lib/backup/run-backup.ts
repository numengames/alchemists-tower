/**
 * Worker-side orchestration: build a world's backup zip and stream it straight
 * to S3. Reuses the Phase-1/2 libraries (DB export, asset listing, artifact +
 * deploy-doc rendering) but, unlike the CLI, never stages assets on disk — each
 * S3 object is piped through the archiver into a multipart upload, so memory and
 * disk stay bounded regardless of world size. Only the small `db.sqlite` touches
 * a temp dir.
 *
 * Assets are appended one at a time (awaiting each archive entry) so at most one
 * S3 stream is open at once — robust over fast, which suits the low backup
 * volume. Render files are appended last, once asset totals are known.
 */
import { ZipArchive, type Archiver } from 'archiver';
import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { Client } from 'pg';

import { readWorldSecretKey } from '../aws-secrets';
import { getAssetObjectStream, listWorldAssetKeys } from '../s3-assets';
import {
  deriveAwsSecretName,
  deriveDbSchema,
  deriveHostname,
  type WorldEnvironment,
} from '../world-templates';
import { IMAGE_REPOSITORY, IMAGE_TAG } from '../world-templates-constants';
import { relativePathForKey } from './assets-download';
import { renderAllDeployDocs } from './deploy-docs';
import { convertWorldSchemaToSqlite } from './pg-to-sqlite';
import {
  renderDockerCompose,
  renderEnvFile,
  renderReadme,
  renderWorldJson,
  type LocalRunConfig,
  type WorldBackupMeta,
} from './render-artifacts';
import {
  ENGINE_IMAGE_ENTRY,
  backupObjectKey,
  getEngineImageStream,
  startBackupUpload,
} from './storage';

export interface RunBackupResult {
  objectKey: string;
  sizeBytes: number;
  assetFiles: number;
  dbTables: Record<string, number>;
}

export interface RunBackupOptions {
  org: string;
  world: string;
  env: WorldEnvironment;
  /** Job id; the archive key is derived from it (retry-idempotent). */
  jobId: string;
  onProgress?: (msg: string) => void;
}

const ADMIN_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateAdminCode(length = 8): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += ADMIN_CHARS[bytes[i] % ADMIN_CHARS.length];
  return out;
}

function safeHostname(org: string, world: string, env: WorldEnvironment): string {
  try {
    return deriveHostname(org, world, env);
  } catch {
    return `${world} (${env})`;
  }
}

/** Append a stream and resolve once the archiver has fully consumed it. */
function appendStream(archive: Archiver, source: Readable, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    source.on('error', reject);
    archive.once('entry', () => resolve());
    archive.append(source, { name });
  });
}

/** Append in-memory content and resolve once the entry is written. */
function appendBuffer(archive: Archiver, content: string, name: string): Promise<void> {
  return new Promise((resolve) => {
    archive.once('entry', () => resolve());
    archive.append(Buffer.from(content), { name });
  });
}

export async function runWorldBackup(opts: RunBackupOptions): Promise<RunBackupResult> {
  const { org, world, env, jobId } = opts;
  const progress = opts.onProgress ?? (() => {});
  const secretId = deriveAwsSecretName(org, world, env);

  const dbUri = await readWorldSecretKey(secretId, 'DB_URI');
  if (!dbUri) throw new Error(`Could not read DB_URI from secret ${secretId}`);
  const sourceSchema =
    (await readWorldSecretKey(secretId, 'DB_SCHEMA')) ?? deriveDbSchema(org, world, env);

  const tmp = await mkdtemp(join(tmpdir(), `world-backup-${jobId}-`));
  const sqlitePath = join(tmp, 'db.sqlite');

  try {
    // 1. World state -> a small SQLite file on the temp dir.
    progress(`exporting schema "${sourceSchema}"`);
    const pg = new Client({ connectionString: dbUri });
    await pg.connect();
    let dbResult;
    try {
      dbResult = await convertWorldSchemaToSqlite({ pg, schema: sourceSchema, sqlitePath });
    } finally {
      await pg.end();
    }

    // 2. Open the streaming upload and wire the archiver into it.
    const objectKey = backupObjectKey(org, world, env, jobId);
    const { stream: s3Stream, done } = startBackupUpload(objectKey);
    const archive: Archiver = new ZipArchive({ zlib: { level: 6 } });
    const archiveErr = new Promise<never>((_, reject) => archive.on('error', reject));
    archive.pipe(s3Stream);

    // 3. db.sqlite first.
    await Promise.race([
      appendStream(archive, createReadStream(sqlitePath), 'world/db.sqlite'),
      archiveErr,
    ]);

    // 4. Stream every asset straight from S3 into the zip, summing sizes.
    const { prefix, keys } = await listWorldAssetKeys({ org, world, env });
    let assetBytes = 0;
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      const name = `world/${relativePathForKey(prefix, key)}`;
      const { body, contentLength } = await getAssetObjectStream(key);
      await Promise.race([appendStream(archive, body, name), archiveErr]);
      assetBytes += contentLength;
      if (i % 25 === 0 || i === keys.length - 1) {
        progress(`assets ${i + 1}/${keys.length}`);
      }
    }

    // 4b. Bundle the prebuilt engine image, if it's been staged, so the zip can
    // run with no internet at all. Best-effort: a missing/forbidden tar just
    // means the recipient pulls or builds the image (both documented).
    let engineImageTar: { path: string; bytes: number } | undefined;
    const engine = await getEngineImageStream();
    if (engine) {
      progress('bundling engine image');
      await Promise.race([appendStream(archive, engine.body, ENGINE_IMAGE_ENTRY), archiveErr]);
      engineImageTar = { path: ENGINE_IMAGE_ENTRY, bytes: engine.contentLength };
    } else {
      progress('engine image not staged — skipping (pull/build-from-source still work)');
    }

    // 5. Render run files last, now that asset totals are known.
    const cfg: LocalRunConfig = {
      worldDir: 'world',
      port: 3000,
      jwtSecret: randomBytes(32).toString('hex'),
      adminCode: generateAdminCode(),
      saveInterval: 60,
      maxUploadSize: 100,
    };
    const meta: WorldBackupMeta = {
      org,
      world,
      env,
      originalHostname: safeHostname(org, world, env),
      dbSchema: sourceSchema,
      engineImage: `${IMAGE_REPOSITORY}:${IMAGE_TAG}`,
      exportedAt: new Date().toISOString(),
      assets: { files: keys.length, bytes: assetBytes },
      db: { tables: dbResult.tables },
      engineImageTar,
    };

    await appendBuffer(archive, renderEnvFile(cfg), '.env');
    await appendBuffer(archive, renderDockerCompose(meta, cfg), 'docker-compose.yml');
    await appendBuffer(archive, renderWorldJson(meta), 'world.json');
    await appendBuffer(archive, renderReadme(meta, cfg), 'README.md');
    for (const [docName, content] of Object.entries(renderAllDeployDocs(meta, cfg))) {
      await appendBuffer(archive, content, `docs/${docName}.md`);
    }

    // 6. Finalize and wait for the upload to complete.
    await archive.finalize();
    await Promise.race([done, archiveErr]);

    return {
      objectKey,
      sizeBytes: archive.pointer(),
      assetFiles: keys.length,
      dbTables: dbResult.tables,
    };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
