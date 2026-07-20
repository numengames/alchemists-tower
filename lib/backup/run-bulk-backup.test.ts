import { PassThrough, Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findFirst, create, update, runWorldBackup, backupArchiveExists, getBackupArchiveStream } =
  vi.hoisted(() => ({
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(async () => ({})),
    runWorldBackup: vi.fn(),
    backupArchiveExists: vi.fn(),
    getBackupArchiveStream: vi.fn(),
  }));

vi.mock('../prisma', () => ({
  prisma: { backupJob: { findFirst, create, update } },
}));

vi.mock('@/generated/prisma/enums', () => ({ Environment: { PRE: 'PRE', PRO: 'PRO' } }));

vi.mock('./run-backup', () => ({ runWorldBackup }));

vi.mock('./storage', () => ({
  BACKUP_LIFECYCLE_DAYS: 7,
  backupArchiveExists,
  getBackupArchiveStream,
  bulkBackupObjectKey: (id: string) => `backups/_all/${id}.zip`,
  // A self-draining sink so the archiver never backpressures in the test.
  startBackupUpload: () => {
    const stream = new PassThrough();
    stream.resume();
    return { stream, done: Promise.resolve() };
  },
}));

import { ensureWorldBackup, runBulkBackup } from './run-bulk-backup';

const target = { org: 'numen-games', world: 'portfolio', env: 'pre' as const };

beforeEach(() => {
  findFirst.mockReset();
  create.mockReset();
  update.mockReset().mockResolvedValue({});
  runWorldBackup.mockReset();
  backupArchiveExists.mockReset();
  getBackupArchiveStream.mockReset().mockImplementation(async () => ({
    body: Readable.from(Buffer.from('inner-zip')),
    contentLength: 9,
  }));
});

describe('ensureWorldBackup', () => {
  it('reuses a fresh archive that still exists, without regenerating', async () => {
    findFirst.mockResolvedValueOnce({
      object_key: 'backups/numen-games/portfolio/pre/old.zip',
      size_bytes: 100n,
    });
    backupArchiveExists.mockResolvedValueOnce(true);

    const out = await ensureWorldBackup(target);

    expect(out.status).toBe('reused');
    expect(out.objectKey).toBe('backups/numen-games/portfolio/pre/old.zip');
    expect(out.sizeBytes).toBe(100);
    expect(create).not.toHaveBeenCalled();
    expect(runWorldBackup).not.toHaveBeenCalled();
  });

  it('regenerates when a completed row exists but its S3 object is gone', async () => {
    findFirst.mockResolvedValueOnce({ object_key: 'backups/gone.zip', size_bytes: 1n });
    backupArchiveExists.mockResolvedValueOnce(false);
    create.mockResolvedValueOnce({ id: 'child-1' });
    runWorldBackup.mockResolvedValueOnce({
      objectKey: 'backups/numen-games/portfolio/pre/child-1.zip',
      sizeBytes: 500,
      assetFiles: 12,
      dbTables: { config: 1 },
    });

    const out = await ensureWorldBackup(target);

    expect(out.status).toBe('generated');
    expect(out.objectKey).toBe('backups/numen-games/portfolio/pre/child-1.zip');
    expect(runWorldBackup).toHaveBeenCalledWith(
      expect.objectContaining({
        org: 'numen-games',
        world: 'portfolio',
        env: 'pre',
        jobId: 'child-1',
      }),
    );
  });

  it('generates when no fresh backup exists', async () => {
    findFirst.mockResolvedValueOnce(null);
    create.mockResolvedValueOnce({ id: 'child-2' });
    runWorldBackup.mockResolvedValueOnce({
      objectKey: 'backups/x/child-2.zip',
      sizeBytes: 1,
      assetFiles: 0,
      dbTables: {},
    });

    const out = await ensureWorldBackup(target);
    expect(out.status).toBe('generated');
    expect(backupArchiveExists).not.toHaveBeenCalled();
  });

  it('reports a failed world without throwing, and marks the child FAILED', async () => {
    findFirst.mockResolvedValueOnce(null);
    create.mockResolvedValueOnce({ id: 'child-3' });
    runWorldBackup.mockRejectedValueOnce(new Error('secret missing'));

    const out = await ensureWorldBackup(target);

    expect(out.status).toBe('failed');
    expect(out.error).toBe('secret missing');
    expect(out.objectKey).toBeUndefined();
    // The child row is transitioned to FAILED.
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'child-3' },
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });
});

describe('runBulkBackup', () => {
  it('reuses + generates across worlds and combines them, counting each', async () => {
    const targets = [
      { org: 'org-a', world: 'w1', env: 'pre' as const },
      { org: 'org-a', world: 'w2', env: 'pro' as const },
    ];

    // w1: reuse (fresh + exists). w2: generate.
    findFirst
      .mockResolvedValueOnce({ object_key: 'backups/org-a/w1/pre/old.zip', size_bytes: 10n })
      .mockResolvedValueOnce(null);
    backupArchiveExists.mockResolvedValueOnce(true);
    create.mockResolvedValueOnce({ id: 'c2' });
    runWorldBackup.mockResolvedValueOnce({
      objectKey: 'backups/org-a/w2/pro/c2.zip',
      sizeBytes: 20,
      assetFiles: 3,
      dbTables: {},
    });

    const progress: string[] = [];
    const result = await runBulkBackup({
      bulkJobId: 'bulk-1',
      targets,
      onProgress: (p) => {
        progress.push(p.phase);
      },
    });

    expect(result.total).toBe(2);
    expect(result.reused).toBe(1);
    expect(result.generated).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.objectKey).toBe('backups/_all/bulk-1.zip');
    // Both per-world zips were streamed into the combined archive.
    expect(getBackupArchiveStream).toHaveBeenCalledTimes(2);
    // Progress went through the combining phase and reached done.
    expect(progress).toContain('combining');
    expect(progress).toContain('done');
  });

  it('throws when every world fails (no empty archive is produced)', async () => {
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({ id: 'cX' });
    runWorldBackup.mockRejectedValue(new Error('boom'));

    await expect(
      runBulkBackup({
        bulkJobId: 'bulk-2',
        targets: [{ org: 'o', world: 'w', env: 'pre' }],
      }),
    ).rejects.toThrow(/No worlds could be backed up/);
    expect(getBackupArchiveStream).not.toHaveBeenCalled();
  });
});
