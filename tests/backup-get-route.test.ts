import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted so the vi.mock factories below (also hoisted) can close over them.
const { findFirst, presignBackupDownload } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  presignBackupDownload: vi.fn(async () => 'https://signed.example/zip'),
}));

// Minimal NextResponse so the handler runs in a plain node env. We only need
// the status + the JSON body back to assert on.
vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      body,
    }),
  },
}));

// withAdmin just runs the handler with a fake admin session.
vi.mock('@/lib/api-auth', () => ({
  withAdmin: (_req: unknown, fn: (s: unknown) => unknown) =>
    fn({ user: { id: 'admin-1', email: 'admin@numen.games' } }),
}));

vi.mock('@/lib/prisma', () => ({ prisma: { backupJob: { findFirst } } }));

// Real validators depend on env config; the route's behaviour under valid input
// is what we're testing, so treat inputs as valid here.
vi.mock('@/lib/world-templates', () => ({
  isValidOrg: () => true,
  isValidWorldName: () => true,
}));

vi.mock('@/lib/backup/queue', () => ({ enqueueBackupJob: vi.fn() }));
vi.mock('@/generated/prisma/enums', () => ({ Environment: { PRE: 'PRE', PRO: 'PRO' } }));

vi.mock('@/lib/backup/storage', () => ({
  presignBackupDownload,
  backupDownloadFilename: () => 'mundo-numen-games-portfolio-pre.zip',
  BACKUP_LIFECYCLE_DAYS: 7,
}));

import { GET } from '@/app/api/worlds/backup/route';

function req(qs: string) {
  return { url: `http://localhost/api/worlds/backup?${qs}` } as unknown as Request;
}

describe('GET /api/worlds/backup', () => {
  beforeEach(() => {
    findFirst.mockReset();
    presignBackupDownload.mockClear();
  });

  it('400s when query params are missing/invalid', async () => {
    const res = (await GET(req('org=numen-games&world=portfolio'))) as unknown as {
      status: number;
      body: { error?: string };
    };
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('prefers an in-flight job and does not query for a completed one', async () => {
    findFirst.mockResolvedValueOnce({
      id: 'job-running',
      status: 'RUNNING',
      organization: 'numen-games',
      world: 'portfolio',
      size_bytes: null,
      asset_files: null,
      object_key: null,
      error_reason: null,
    });

    const res = (await GET(req('org=numen-games&world=portfolio&env=pre'))) as unknown as {
      status: number;
      body: { job: { id: string; status: string; download: unknown } };
    };

    expect(findFirst).toHaveBeenCalledTimes(1); // active branch short-circuits
    expect(res.body.job.id).toBe('job-running');
    expect(res.body.job.status).toBe('RUNNING');
    expect(res.body.job.download).toBeNull();
    expect(presignBackupDownload).not.toHaveBeenCalled();
  });

  it('falls back to the latest completed job with a presigned download', async () => {
    findFirst
      .mockResolvedValueOnce(null) // no active job
      .mockResolvedValueOnce({
        id: 'job-done',
        status: 'COMPLETED',
        organization: 'numen-games',
        world: 'portfolio',
        size_bytes: 227538251n,
        asset_files: 120,
        object_key: 'backups/numen-games/portfolio/pre/job-done.zip',
        error_reason: null,
        completed_at: new Date('2026-06-16T06:28:52.000Z'),
      });

    const res = (await GET(req('org=numen-games&world=portfolio&env=pre'))) as unknown as {
      status: number;
      body: {
        job: {
          id: string;
          sizeBytes: number;
          download: { url: string } | null;
          archiveExpiresAt: string | null;
        };
      };
    };

    expect(findFirst).toHaveBeenCalledTimes(2);
    expect(res.body.job.id).toBe('job-done');
    expect(res.body.job.sizeBytes).toBe(227538251); // BigInt -> number
    expect(res.body.job.download?.url).toBe('https://signed.example/zip');
    // completed_at + 7-day lifecycle.
    expect(res.body.job.archiveExpiresAt).toBe('2026-06-23T06:28:52.000Z');
    expect(presignBackupDownload).toHaveBeenCalledOnce();
  });

  it('returns { job: null } when nothing exists', async () => {
    findFirst.mockResolvedValue(null);

    const res = (await GET(req('org=numen-games&world=portfolio&env=pre'))) as unknown as {
      status: number;
      body: { job: unknown };
    };

    expect(res.status).toBe(200);
    expect(res.body.job).toBeNull();
  });
});
