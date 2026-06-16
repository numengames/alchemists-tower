import { describe, expect, it } from 'vitest';

import { ENGINE_COMMIT } from './render-artifacts';
import { backupDownloadFilename, backupObjectKey, engineImageKey } from './storage';

describe('backupObjectKey', () => {
  it('keys by org/world/env/jobId under the backups prefix', () => {
    expect(backupObjectKey('numinia', 'genesis', 'pro', 'job_abc')).toBe(
      'backups/numinia/genesis/pro/job_abc.zip',
    );
  });

  it('is deterministic for a given job (retry-idempotent)', () => {
    const a = backupObjectKey('r3s3t', 'world', 'pre', 'job_1');
    const b = backupObjectKey('r3s3t', 'world', 'pre', 'job_1');
    expect(a).toBe(b);
  });
});

describe('backupDownloadFilename', () => {
  it('produces a friendly archive name', () => {
    expect(backupDownloadFilename('numinia', 'genesis', 'pro')).toBe(
      'mundo-numinia-genesis-pro.zip',
    );
  });
});

describe('engineImageKey', () => {
  it('lives outside the backups prefix so the lifecycle rule never expires it', () => {
    const key = engineImageKey();
    expect(key.startsWith('backups/')).toBe(false);
    expect(key).toBe(`backup-engine/numinia-hyperfy2-${ENGINE_COMMIT}.tar.gz`);
  });
});
