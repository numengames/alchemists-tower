/**
 * Next.js instrumentation hook. Runs once when the server process starts.
 * We use it to boot the in-pod pg-boss worker that drains the world-backup
 * queue. Guarded to the Node.js runtime (not Edge, not the build step) and
 * skippable via BACKUP_WORKER_DISABLED for environments that shouldn't process
 * jobs (e.g. a future dedicated worker deployment).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.BACKUP_WORKER_DISABLED === 'true') return;
  if (!process.env.DATABASE_URL) return;

  try {
    const { startBackupWorker } = await import('./lib/backup/queue');
    await startBackupWorker();
  } catch (err) {
    // A worker failure must not crash the web server; log and continue.
    console.error('[instrumentation] backup worker did not start:', err);
  }
}
