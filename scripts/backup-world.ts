/**
 * CLI: produce a self-contained, runnable backup of a single hyperfy2 world.
 *
 * Usage:
 *   pnpm world:backup --org <org> --world <world> --env <pre|pro> [--out <dir>]
 *
 * It reuses the backoffice libs to: read the world secret (for the live DB
 * connection), export its Postgres schema into world/db.sqlite, download its S3
 * assets into world/assets/, render the run files (.env, docker-compose.yml,
 * world.json, README, docs/), and tar.gz the lot.
 *
 * Requires the same env the backoffice uses (AWS creds/region, ASSETS_BUCKET,
 * ORGS_CONFIG_JSON, …). Reads a local .env via dotenv. Aurora must be reachable
 * (VPN) for the DB step. This is the Phase-1 manual driver; Phase 3 wraps the
 * same library calls behind an async queue.
 */
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from 'pg';

import { readWorldSecretKey } from '../lib/aws-secrets';
import { downloadWorldAssets } from '../lib/backup/assets-download';
import { renderAllDeployDocs } from '../lib/backup/deploy-docs';
import { convertWorldSchemaToSqlite } from '../lib/backup/pg-to-sqlite';
import {
  formatBytes,
  renderDockerCompose,
  renderEnvFile,
  renderReadme,
  renderWorldJson,
  type LocalRunConfig,
  type WorldBackupMeta,
} from '../lib/backup/render-artifacts';
import {
  deriveAwsSecretName,
  deriveDbSchema,
  deriveHostname,
  type WorldEnvironment,
} from '../lib/world-templates';
import { IMAGE_REPOSITORY, IMAGE_TAG } from '../lib/world-templates-constants';

interface Args {
  org: string;
  world: string;
  env: WorldEnvironment;
  out: string;
}

function parseArgs(argv: string[]): Args {
  const map = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) map.set(a.slice(2), argv[++i] ?? '');
  }
  const org = map.get('org');
  const world = map.get('world');
  const env = map.get('env');
  if (!org || !world || !env) {
    fail('Usage: pnpm world:backup --org <org> --world <world> --env <pre|pro> [--out <dir>]');
  }
  if (env !== 'pre' && env !== 'pro') fail(`--env must be "pre" or "pro" (got "${env}")`);
  return { org, world, env, out: resolve(map.get('out') ?? process.cwd()) };
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

function log(step: string, msg: string) {
  process.stdout.write(`[${step}] ${msg}\n`);
}

function fail(msg: string): never {
  process.stderr.write(`ERROR: ${msg}\n`);
  process.exit(1);
}

async function main() {
  const { org, world, env, out } = parseArgs(process.argv.slice(2));
  const secretId = deriveAwsSecretName(org, world, env);
  const dbSchema = deriveDbSchema(org, world, env);

  log('init', `world=${org}/${world}/${env}  secret=${secretId}  schema=${dbSchema}`);

  // 1. Live DB connection comes from the world's secret.
  const dbUri = await readWorldSecretKey(secretId, 'DB_URI');
  if (!dbUri) fail(`Could not read DB_URI from secret ${secretId} (missing secret or key?)`);
  const sourceSchema = (await readWorldSecretKey(secretId, 'DB_SCHEMA')) ?? dbSchema;

  // Staging tree = the backup root.
  const stageRoot = mkdtempSync(join(tmpdir(), `world-backup-${world}-`));
  const worldDir = join(stageRoot, 'world');
  await mkdir(join(worldDir, 'assets'), { recursive: true });
  await mkdir(join(stageRoot, 'docs'), { recursive: true });

  try {
    // 2. Export Postgres -> world/db.sqlite
    log('db', `connecting to Aurora and exporting schema "${sourceSchema}"…`);
    const pg = new Client({ connectionString: dbUri });
    await pg.connect();
    let dbResult;
    try {
      dbResult = await convertWorldSchemaToSqlite({
        pg,
        schema: sourceSchema,
        sqlitePath: join(worldDir, 'db.sqlite'),
      });
    } finally {
      await pg.end();
    }
    const rows = Object.values(dbResult.tables).reduce((a, b) => a + b, 0);
    log(
      'db',
      `exported ${rows} rows across ${Object.keys(dbResult.tables).length} tables` +
        (dbResult.missing.length ? ` (absent: ${dbResult.missing.join(', ')})` : ''),
    );

    // 3. Download assets -> world/assets/
    log('assets', 'listing and downloading from S3…');
    const assetResult = await downloadWorldAssets({
      org,
      world,
      env,
      destDir: worldDir,
      onProgress: (p) => {
        if (p.files % 25 === 0 || p.files === p.total) {
          log('assets', `${p.files}/${p.total} files (${formatBytes(p.bytes)})`);
        }
      },
    });
    log('assets', `downloaded ${assetResult.files} files (${formatBytes(assetResult.bytes)})`);

    // 4. Render run files
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
      assets: assetResult,
      db: { tables: dbResult.tables },
    };

    await writeFile(join(stageRoot, '.env'), renderEnvFile(cfg));
    await writeFile(join(stageRoot, 'docker-compose.yml'), renderDockerCompose(meta, cfg));
    await writeFile(join(stageRoot, 'world.json'), renderWorldJson(meta));
    await writeFile(join(stageRoot, 'README.md'), renderReadme(meta, cfg));
    const deployDocs = renderAllDeployDocs(meta, cfg);
    for (const [name, content] of Object.entries(deployDocs)) {
      await writeFile(join(stageRoot, 'docs', `${name}.md`), content);
    }
    log('render', 'wrote .env, docker-compose.yml, world.json, README.md, docs/ (4 guides)');

    // 5. Package
    await mkdir(out, { recursive: true });
    const archive = join(out, `mundo-${org}-${world}-${env}.tar.gz`);
    execFileSync('tar', ['-czf', archive, '-C', stageRoot, '.'], { stdio: 'inherit' });
    log('done', `backup ready: ${archive}`);
  } finally {
    await rm(stageRoot, { recursive: true, force: true });
  }
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
