import { describe, expect, it } from 'vitest';

import {
  ENGINE_COMMIT,
  ENGINE_REPO_URL,
  formatBytes,
  renderDockerCompose,
  renderEnvFile,
  renderReadme,
  renderWorldJson,
  type LocalRunConfig,
  type WorldBackupMeta,
} from './render-artifacts';

const cfg: LocalRunConfig = {
  worldDir: 'world',
  port: 3000,
  jwtSecret: 'fresh-jwt-secret',
  adminCode: 'ABCD2345',
  saveInterval: 60,
  maxUploadSize: 100,
};

const meta: WorldBackupMeta = {
  org: 'numinia',
  world: 'genesis',
  env: 'pro',
  originalHostname: 'genesis.numinia.xyz',
  dbSchema: 'pro-numinia-genesis',
  engineImage: 'ghcr.io/numengames/numinia-hyperfy2:dev',
  exportedAt: '2026-06-09T12:00:00.000Z',
  assets: { files: 42, bytes: 1536 },
  db: { tables: { config: 3, entities: 10, blueprints: 5 } },
};

describe('renderEnvFile', () => {
  it('produces a fully-offline config (SQLite + local assets)', () => {
    const env = renderEnvFile(cfg);
    expect(env).toContain('DB_URI=local');
    expect(env).toContain('ASSETS=local');
    expect(env).toContain('COLLECTIONS=local');
    expect(env).toContain('WORLD=world');
    expect(env).toContain('JWT_SECRET=fresh-jwt-secret');
    expect(env).toContain('ADMIN_CODE=ABCD2345');
    expect(env).toContain('PUBLIC_WS_URL=ws://localhost:3000/ws');
    expect(env).toContain('ASSETS_BASE_URL=http://localhost:3000/assets');
  });

  it('never leaks an S3 URI or a Postgres connection string', () => {
    const env = renderEnvFile(cfg);
    expect(env).not.toContain('ASSETS_S3_URI');
    expect(env).not.toMatch(/postgres(ql)?:\/\//);
  });
});

const metaWithTar: WorldBackupMeta = {
  ...meta,
  engineImageTar: { path: 'engine/numinia-hyperfy2.tar.gz', bytes: 380 * 1024 * 1024 },
};

describe('renderDockerCompose', () => {
  it('uses the prebuilt image and mounts the world dir', () => {
    const yml = renderDockerCompose(meta, cfg);
    expect(yml).toContain(`image: ${meta.engineImage}`);
    expect(yml).toContain('- ./world:/app/world');
    expect(yml).toContain('"3000:3000"');
    expect(yml).toContain('env_file: .env');
  });

  it('documents the build-from-source fallback pinned to the public commit', () => {
    const yml = renderDockerCompose(meta, cfg);
    expect(yml).toContain(`${ENGINE_REPO_URL}.git#${ENGINE_COMMIT}`);
  });

  it('adds a docker-load hint only when an engine tar is bundled', () => {
    expect(renderDockerCompose(meta, cfg)).not.toContain('docker load');
    const yml = renderDockerCompose(metaWithTar, cfg);
    expect(yml).toContain('gunzip -c engine/numinia-hyperfy2.tar.gz | docker load');
  });
});

describe('renderWorldJson', () => {
  it('is valid JSON carrying provenance and content counts', () => {
    const parsed = JSON.parse(renderWorldJson(meta));
    expect(parsed.org).toBe('numinia');
    expect(parsed.world).toBe('genesis');
    expect(parsed.sourceDbSchema).toBe('pro-numinia-genesis');
    expect(parsed.engine.commit).toBe(ENGINE_COMMIT);
    expect(parsed.contents.dbRowsByTable).toEqual({
      config: 3,
      entities: 10,
      blueprints: 5,
    });
    expect(parsed.backupFormat).toBe(1);
  });

  it('records the bundled engine tar when present, null when absent', () => {
    expect(JSON.parse(renderWorldJson(meta)).engine.bundledTar).toBeNull();
    const parsed = JSON.parse(renderWorldJson(metaWithTar));
    expect(parsed.engine.bundledTar).toBe('engine/numinia-hyperfy2.tar.gz');
    expect(parsed.engine.bundledTarBytes).toBe(380 * 1024 * 1024);
  });
});

describe('renderReadme', () => {
  it('includes the one-command run and the admin code', () => {
    const md = renderReadme(meta, cfg);
    expect(md).toContain('docker compose up');
    expect(md).toContain('ABCD2345');
    expect(md).toContain('http://localhost:3000');
    expect(md).toContain('docs/DEPLOY-AWS.md');
  });

  it('documents the bundled engine tar (load step + table row) only when present', () => {
    expect(renderReadme(meta, cfg)).not.toContain('docker load');
    const md = renderReadme(metaWithTar, cfg);
    expect(md).toContain('gunzip -c engine/numinia-hyperfy2.tar.gz | docker load');
    expect(md).toContain('| `engine/numinia-hyperfy2.tar.gz` |');
    expect(md).toContain('no internet at all');
  });
});

describe('formatBytes', () => {
  it('formats across units', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.0 GB');
  });
});
