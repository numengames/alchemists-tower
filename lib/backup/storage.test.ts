import { describe, expect, it } from 'vitest';

import { ENGINE_COMMIT } from './render-artifacts';
import {
  backupDownloadFilename,
  backupObjectKey,
  bulkBackupDownloadFilename,
  bulkBackupObjectKey,
  engineImageKey,
} from './storage';

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

describe('bulkBackupObjectKey', () => {
  it('keys the combined archive under backups/_all so the lifecycle rule expires it', () => {
    expect(bulkBackupObjectKey('bulk_123')).toBe('backups/_all/bulk_123.zip');
  });

  it('never collides with a real per-world key (orgs can\'t contain "_")', () => {
    // A real per-world key is backups/<org>/... and orgs are lowercase-hyphen,
    // so the `_all` segment is unreachable by any org name.
    expect(bulkBackupObjectKey('x').startsWith('backups/_all/')).toBe(true);
  });
});

describe('bulkBackupDownloadFilename', () => {
  it('produces a friendly combined-archive name', () => {
    expect(bulkBackupDownloadFilename()).toBe('todos-los-mundos.zip');
  });
});

describe('engineImageKey', () => {
  it('lives outside the backups prefix so the lifecycle rule never expires it', () => {
    const key = engineImageKey();
    expect(key.startsWith('backups/')).toBe(false);
    expect(key).toBe(`backup-engine/numinia-hyperfy2-${ENGINE_COMMIT}.tar.gz`);
  });
});
