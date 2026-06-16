'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Archive, Download, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/toast-provider';
import type { World } from '@/lib/k8s';

interface BackupWorldModalProps {
  isOpen: boolean;
  world: World | null;
  onClose: () => void;
}

type Phase = 'loading' | 'idle' | 'tracking' | 'done' | 'error';

interface JobStatus {
  id: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  sizeBytes: number | null;
  assetFiles: number | null;
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

export function BackupWorldModal({ isOpen, world, onClose }: BackupWorldModalProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
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

  // Poll the job status until it reaches a terminal state.
  useEffect(() => {
    if (!jobId || phase !== 'tracking') return;
    cancelledRef.current = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const res = await fetch(`/api/worlds/backup/${jobId}`);
        const data = (await res.json()) as JobStatus & { error?: string };
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

  // On open, look up the latest backup for this world so we resume an in-flight
  // job or surface the existing archive instead of offering a redundant new one.
  useEffect(() => {
    if (!isOpen || !world) return;
    let cancelled = false;
    setPhase('loading');
    setJob(null);
    setJobId(null);
    setErrorMsg(null);
    (async () => {
      try {
        const params = new URLSearchParams({
          org: world.organization,
          world: world.worldName,
          env: world.environment,
        });
        const res = await fetch(`/api/worlds/backup?${params.toString()}`);
        const data = await res.json();
        if (cancelled) return;
        const existing = res.ok ? (data.job as JobStatus | null) : null;
        if (!existing) {
          setPhase('idle');
          return;
        }
        setJob(existing);
        setJobId(existing.id);
        if (existing.status === 'COMPLETED') {
          setPhase('done');
        } else if (existing.status === 'QUEUED' || existing.status === 'RUNNING') {
          setPhase('tracking');
        } else {
          setPhase('idle');
        }
      } catch {
        // Lookup failed — fall back to idle so the user can still start a backup.
        if (!cancelled) setPhase('idle');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, world]);

  if (!isOpen || !world) return null;

  const handleClose = () => {
    // Closing while a job runs just stops local polling; the worker continues.
    cancelledRef.current = true;
    reset();
    onClose();
  };

  const handleStart = async () => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/worlds/backup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          org: world.organization,
          world: world.worldName,
          env: world.environment,
        }),
      });
      const data = await res.json();
      if (res.status === 409 && data.jobId) {
        // A backup for this world is already running — track it instead.
        setJobId(data.jobId as string);
        setPhase('tracking');
        showToast('A backup is already in progress — showing its status', 'info');
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
      showToast('Backup started', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      showToast(message, 'error');
      setErrorMsg(message);
      setPhase('error');
    } finally {
      setSubmitting(false);
    }
  };

  // Presigned URLs expire (1 h); the modal can sit open longer than that, so
  // fetch a fresh one at click time instead of trusting the polled snapshot.
  const handleDownload = async () => {
    if (!jobId) return;
    try {
      const res = await fetch(`/api/worlds/backup/${jobId}`);
      const data = (await res.json()) as JobStatus & { error?: string };
      if (!res.ok || !data.download) {
        showToast(data.error ?? 'Download link unavailable', 'error');
        return;
      }
      window.location.assign(data.download.url);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Network error', 'error');
    }
  };

  const statusLabel =
    job?.status === 'QUEUED'
      ? 'Queued…'
      : job?.status === 'RUNNING'
        ? 'Building archive…'
        : 'Starting…';

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Back up world"
    >
      <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full shadow-xl animate-in fade-in duration-200">
        <div className="flex items-start gap-4">
          <Archive className="w-6 h-6 text-sky-400 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
          <div className="flex-1 min-w-0">
            {phase === 'loading' && (
              <div className="flex items-center gap-3 py-4">
                <Loader2 className="w-5 h-5 text-sky-400 animate-spin" strokeWidth={2} />
                <span className="text-sm text-foreground/70">Checking for an existing backup…</span>
              </div>
            )}

            {phase === 'idle' && (
              <>
                <h3 className="text-lg font-bold text-foreground mb-2">Back up world?</h3>
                <p className="text-foreground/60 text-sm mb-4">
                  Create a downloadable archive of{' '}
                  <span className="text-foreground font-mono">
                    {world.organization}/{world.worldName} ({world.environment})
                  </span>
                  . The archive is self-contained and runs offline:
                </p>
                <ul className="text-xs text-foreground/60 mb-6 list-disc pl-5 space-y-1">
                  <li>World state (Postgres → SQLite) and every S3 asset.</li>
                  <li>
                    A <code>docker-compose.yml</code> + <code>.env</code> to run it locally with one
                    command.
                  </li>
                  <li>Step-by-step deploy guides: local, AWS, Azure, GCP.</li>
                  <li>Large worlds may take a few minutes to build.</li>
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
                <h3 className="text-lg font-bold text-foreground mb-2">Building backup…</h3>
                <div className="flex items-center gap-3 p-4 rounded-lg bg-sidebar-accent/20 mb-6">
                  <Loader2 className="w-5 h-5 text-sky-400 animate-spin" strokeWidth={2} />
                  <div className="text-sm text-foreground/80">{statusLabel}</div>
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
                    <span className="text-foreground/70">Assets:</span>
                    <span className="font-mono text-foreground">{job.assetFiles ?? '—'} files</span>
                  </div>
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
                  {submitting ? 'Starting…' : 'Or build a fresh backup'}
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
                    onClick={() => {
                      reset();
                    }}
                    className="flex-1 bg-sky-500 text-white hover:bg-sky-600"
                  >
                    Try again
                  </Button>
                </div>
                {world.url && (
                  <a
                    href={world.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-xs text-foreground/50 hover:text-foreground"
                  >
                    <ExternalLink className="w-3 h-3" /> open world
                  </a>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
