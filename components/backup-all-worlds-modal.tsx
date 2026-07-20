'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Boxes, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/toast-provider';

interface BackupAllWorldsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Phase = 'loading' | 'idle' | 'tracking' | 'done' | 'error';

interface BulkProgress {
  total: number;
  reused: number;
  generated: number;
  failed: number;
  done: number;
  phase: 'queued' | 'backing-up' | 'combining' | 'done';
  current: string | null;
  worlds: { org: string; world: string; env: string; status: string; error?: string }[];
}

interface BulkJobStatus {
  id: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  sizeBytes: number | null;
  progress: BulkProgress | null;
  error: string | null;
  download: { url: string; expiresInSeconds: number } | null;
  archiveExpiresAt: string | null;
}

const POLL_INTERVAL_MS = 3000;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(1)} ${units[i]}`;
}

/** Whole days left until the archive's S3 lifecycle expires it. */
function formatExpiry(iso: string): string {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'expires today';
  return `${days} day${days === 1 ? '' : 's'}`;
}

function phaseLabel(p: BulkProgress | null, status: BulkJobStatus['status']): string {
  if (status === 'QUEUED' || p?.phase === 'queued') return 'Queued…';
  if (p?.phase === 'combining') return 'Combining into one archive…';
  if (p?.phase === 'backing-up') {
    return p.current ? `Backing up ${p.current}…` : 'Backing up worlds…';
  }
  return 'Starting…';
}

export function BackupAllWorldsModal({ isOpen, onClose }: BackupAllWorldsModalProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<BulkJobStatus | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { showToast } = useToast();
  const cancelledRef = useRef(false);

  const reset = useCallback(() => {
    setPhase('idle');
    setSubmitting(false);
    setJobId(null);
    setJob(null);
    setErrorMsg(null);
  }, []);

  // Poll the job until it reaches a terminal state.
  useEffect(() => {
    if (!jobId || phase !== 'tracking') return;
    cancelledRef.current = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const res = await fetch(`/api/worlds/backup/all/${jobId}`);
        const data = (await res.json()) as BulkJobStatus & { error?: string };
        if (cancelledRef.current) return;
        if (!res.ok) {
          setErrorMsg(data.error ?? 'Failed to read backup status');
          setPhase('error');
          return;
        }
        setJob(data);
        if (data.status === 'COMPLETED') {
          setPhase('done');
        } else if (data.status === 'FAILED') {
          setErrorMsg(data.error ?? 'Backup failed');
          setPhase('error');
        } else {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (cancelledRef.current) return;
        setErrorMsg(err instanceof Error ? err.message : 'Network error');
        setPhase('error');
      }
    };

    timer = setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      cancelledRef.current = true;
      clearTimeout(timer);
    };
  }, [jobId, phase]);

  // On open, look up the latest run so we resume a live one or surface the
  // existing combined archive instead of offering a redundant new one.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setPhase('loading');
    setJob(null);
    setJobId(null);
    setErrorMsg(null);
    (async () => {
      try {
        const res = await fetch('/api/worlds/backup/all');
        const data = await res.json();
        if (cancelled) return;
        const existing = res.ok ? (data.job as BulkJobStatus | null) : null;
        if (!existing) {
          setPhase('idle');
          return;
        }
        setJob(existing);
        setJobId(existing.id);
        if (existing.status === 'COMPLETED') setPhase('done');
        else if (existing.status === 'QUEUED' || existing.status === 'RUNNING')
          setPhase('tracking');
        else setPhase('idle');
      } catch {
        if (!cancelled) setPhase('idle');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    cancelledRef.current = true;
    reset();
    onClose();
  };

  const handleStart = async () => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/worlds/backup/all', { method: 'POST' });
      const data = await res.json();
      if (res.status === 409 && data.jobId) {
        setJobId(data.jobId as string);
        setPhase('tracking');
        showToast('A full backup is already in progress — showing its status', 'info');
        return;
      }
      if (!res.ok) {
        showToast(data.error ?? 'Failed to start backup', 'error');
        setErrorMsg(data.error ?? 'Failed to start backup');
        setPhase('error');
        return;
      }
      setJobId(data.jobId as string);
      setPhase('tracking');
      showToast(`Backing up ${data.total} world${data.total === 1 ? '' : 's'}…`, 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      showToast(message, 'error');
      setErrorMsg(message);
      setPhase('error');
    } finally {
      setSubmitting(false);
    }
  };

  // Presigned URLs expire (1 h); fetch a fresh one at click time.
  const handleDownload = async () => {
    if (!jobId) return;
    try {
      const res = await fetch(`/api/worlds/backup/all/${jobId}`);
      const data = (await res.json()) as BulkJobStatus & { error?: string };
      if (!res.ok || !data.download) {
        showToast(data.error ?? 'Download link unavailable', 'error');
        return;
      }
      window.location.assign(data.download.url);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Network error', 'error');
    }
  };

  const p = job?.progress ?? null;
  const pct = p && p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Back up all worlds"
    >
      <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full shadow-xl animate-in fade-in duration-200">
        <div className="flex items-start gap-4">
          <Boxes className="w-6 h-6 text-sky-400 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
          <div className="flex-1 min-w-0">
            {phase === 'loading' && (
              <div className="flex items-center gap-3 py-4">
                <Loader2 className="w-5 h-5 text-sky-400 animate-spin" strokeWidth={2} />
                <span className="text-sm text-foreground/70">Checking for an existing backup…</span>
              </div>
            )}

            {phase === 'idle' && (
              <>
                <h3 className="text-lg font-bold text-foreground mb-2">Back up all worlds?</h3>
                <p className="text-foreground/60 text-sm mb-4">
                  Bundle <span className="text-foreground font-semibold">every world</span> into a
                  single downloadable archive:
                </p>
                <ul className="text-xs text-foreground/60 mb-6 list-disc pl-5 space-y-1">
                  <li>
                    Worlds already backed up in the last {7} days are <strong>reused</strong> — only
                    the missing ones are generated.
                  </li>
                  <li>
                    The result is a zip of per-world zips, each self-contained and runnable with{' '}
                    <code>docker compose up</code>.
                  </li>
                  <li>This can take several minutes for many or large worlds.</li>
                </ul>
                <div className="flex gap-3">
                  <Button
                    onClick={handleClose}
                    variant="outline"
                    className="flex-1 border-border hover:bg-sidebar bg-transparent"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleStart}
                    disabled={submitting}
                    className="flex-1 bg-sky-500 text-white hover:bg-sky-600"
                  >
                    {submitting ? 'Starting…' : 'Start backup'}
                  </Button>
                </div>
              </>
            )}

            {phase === 'tracking' && (
              <>
                <h3 className="text-lg font-bold text-foreground mb-2">Backing up all worlds…</h3>
                <div className="p-4 rounded-lg bg-sidebar-accent/20 mb-4">
                  <div className="flex items-center gap-3 mb-3">
                    <Loader2 className="w-5 h-5 text-sky-400 animate-spin" strokeWidth={2} />
                    <div className="text-sm text-foreground/80">
                      {phaseLabel(p, job?.status ?? 'QUEUED')}
                    </div>
                  </div>
                  {p && (
                    <>
                      <div className="h-1.5 w-full rounded-full bg-sidebar-accent/40 overflow-hidden mb-2">
                        <div
                          className="h-full bg-sky-500 transition-all duration-500"
                          style={{ width: `${p.phase === 'combining' ? 100 : pct}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-foreground/60">
                        <span>
                          {p.done}/{p.total} worlds
                        </span>
                        <span className="font-mono">
                          {p.reused} reused · {p.generated} new
                          {p.failed > 0 ? ` · ${p.failed} failed` : ''}
                        </span>
                      </div>
                    </>
                  )}
                </div>
                <p className="text-xs text-foreground/50 mb-6">
                  You can close this — the backup keeps running. Reopen it later to grab the
                  download link.
                </p>
                <Button
                  onClick={handleClose}
                  variant="outline"
                  className="w-full border-border hover:bg-sidebar bg-transparent"
                >
                  Close
                </Button>
              </>
            )}

            {phase === 'done' && job && (
              <>
                <h3 className="text-lg font-bold text-foreground mb-2">Backup ready</h3>
                <div className="p-4 rounded-lg bg-sidebar-accent/20 space-y-2 text-xs mb-6">
                  <div className="flex justify-between">
                    <span className="text-foreground/70">Worlds included:</span>
                    <span className="font-mono text-foreground">
                      {p ? p.reused + p.generated : '—'}
                      {p ? ` (${p.reused} reused, ${p.generated} new)` : ''}
                    </span>
                  </div>
                  {p && p.failed > 0 && (
                    <div className="flex justify-between">
                      <span className="text-foreground/70">Skipped (failed):</span>
                      <span className="font-mono text-amber-400">{p.failed}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-foreground/70">Archive size:</span>
                    <span className="font-mono text-foreground">
                      {job.sizeBytes !== null ? formatBytes(job.sizeBytes) : '—'}
                    </span>
                  </div>
                  {job.archiveExpiresAt && (
                    <div className="flex justify-between">
                      <span className="text-foreground/70">Available for:</span>
                      <span className="font-mono text-foreground">
                        {formatExpiry(job.archiveExpiresAt)}
                      </span>
                    </div>
                  )}
                </div>
                {p && p.failed > 0 && (
                  <p className="text-xs text-amber-400/80 mb-4">
                    {p.failed} world{p.failed === 1 ? '' : 's'} could not be exported and{' '}
                    {p.failed === 1 ? 'is' : 'are'} not in the archive. See{' '}
                    <code>manifest.json</code> inside the zip for details.
                  </p>
                )}
                <div className="flex gap-3">
                  <Button
                    onClick={handleClose}
                    variant="outline"
                    className="flex-1 border-border hover:bg-sidebar bg-transparent"
                  >
                    Done
                  </Button>
                  {job.download && (
                    <Button
                      onClick={handleDownload}
                      className="flex-1 gap-2 bg-sky-500 text-white hover:bg-sky-600"
                    >
                      <Download className="w-4 h-4" strokeWidth={1.75} />
                      Download
                    </Button>
                  )}
                </div>
                <button
                  onClick={handleStart}
                  disabled={submitting}
                  className="mt-3 text-xs text-foreground/50 hover:text-foreground disabled:opacity-50"
                >
                  {submitting ? 'Starting…' : 'Or rebuild (re-checks every world)'}
                </button>
              </>
            )}

            {phase === 'error' && (
              <>
                <h3 className="text-lg font-bold text-foreground mb-2">Backup failed</h3>
                <div className="p-3 rounded-md border border-red-500/30 bg-red-500/5 text-xs text-red-300/90 mb-6 break-words">
                  {errorMsg ?? 'Unknown error — check the worker logs.'}
                </div>
                <div className="flex gap-3">
                  <Button
                    onClick={handleClose}
                    variant="outline"
                    className="flex-1 border-border hover:bg-sidebar bg-transparent"
                  >
                    Close
                  </Button>
                  <Button
                    onClick={() => reset()}
                    className="flex-1 bg-sky-500 text-white hover:bg-sky-600"
                  >
                    Try again
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
