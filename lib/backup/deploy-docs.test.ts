import { describe, expect, it } from 'vitest';

import {
  DEPLOY_DOCS,
  renderAllDeployDocs,
  renderDeployAzure,
  renderDeployGcp,
  renderDeployLocal,
} from './deploy-docs';
import { ENGINE_COMMIT, type LocalRunConfig, type WorldBackupMeta } from './render-artifacts';

const cfg: LocalRunConfig = {
  worldDir: 'world',
  port: 3000,
  jwtSecret: 'fresh',
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
  assets: { files: 42, bytes: 2 * 1024 ** 3 },
  db: { tables: { config: 3, entities: 10 } },
};

describe('renderAllDeployDocs', () => {
  it('produces one doc per DEPLOY_DOCS entry, all non-empty', () => {
    const docs = renderAllDeployDocs(meta, cfg);
    expect(Object.keys(docs).sort()).toEqual([...DEPLOY_DOCS].sort());
    for (const name of DEPLOY_DOCS) {
      expect(docs[name].length).toBeGreaterThan(200);
    }
  });

  it('every doc carries the AI context block and the world identity', () => {
    const docs = renderAllDeployDocs(meta, cfg);
    for (const name of DEPLOY_DOCS) {
      expect(docs[name]).toContain('For AI assistants');
      expect(docs[name]).toContain('genesis');
      expect(docs[name]).toContain(ENGINE_COMMIT);
    }
  });

  it('every cloud doc explains the public-origin WS/HTTPS requirement', () => {
    const docs = renderAllDeployDocs(meta, cfg);
    for (const name of ['DEPLOY-AWS', 'DEPLOY-AZURE', 'DEPLOY-GCP'] as const) {
      expect(docs[name]).toContain('PUBLIC_WS_URL=wss://');
      expect(docs[name]).toContain('/ws');
    }
  });
});

describe('renderDeployLocal', () => {
  it('gives both the Docker one-liner and the build-from-source fallback', () => {
    const md = renderDeployLocal(meta, cfg);
    expect(md).toContain('docker compose up');
    expect(md).toContain('npm run build');
    expect(md).toContain('git checkout ' + ENGINE_COMMIT);
    expect(md).toContain('ABCD2345'); // admin code surfaced to the operator here
  });
});

describe('storage-compatibility honesty', () => {
  it('Azure doc warns Blob is not S3-compatible and keeps assets local', () => {
    const md = renderDeployAzure(meta, cfg);
    expect(md).toMatch(/Azure Blob Storage does not/i);
    expect(md).toContain('ASSETS=local');
  });

  it('GCP doc uses S3-interoperability against GCS', () => {
    const md = renderDeployGcp(meta, cfg);
    expect(md).toMatch(/interoperability/i);
    expect(md).toContain('storage.googleapis.com');
  });
});
