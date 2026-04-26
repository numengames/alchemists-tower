'use client';

import { useState } from 'react';
import { AlertCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/toast-provider';
import type { World } from '@/lib/k8s';

interface DeleteWorldModalProps {
  isOpen: boolean;
  world: World | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface DeleteResult {
  prUrl: string | null;
  prNumber: number | null;
  branch: string;
  awsSecretId: string;
  awsSecretDeleted: boolean;
  dnsSkipped: boolean;
  dnsDeleted: boolean;
  dnsRecord: string | null;
  hadDbRow: boolean;
}

export function DeleteWorldModal({ isOpen, world, onClose, onSuccess }: DeleteWorldModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [result, setResult] = useState<DeleteResult | null>(null);
  const { showToast } = useToast();

  if (!isOpen || !world) return null;

  const expected = `${world.organization}/${world.worldName}`;
  const matches = confirmText.trim() === expected;

  const handleClose = () => {
    if (submitting) return;
    setConfirmText('');
    setResult(null);
    onClose();
  };

  const handleConfirm = async () => {
    if (!matches) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/worlds', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          org: world.organization,
          world: world.worldName,
          env: world.environment,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? 'Failed to delete world', 'error');
        return;
      }
      const r = data.deleted as {
        pr_url: string | null;
        pr_number: number | null;
        branch: string;
        aws_secret_id: string;
        aws_secret_deleted: boolean;
        dns_skipped: boolean;
        dns_deleted: boolean;
        dns_record: string | null;
        had_db_row: boolean;
      };
      setResult({
        prUrl: r.pr_url,
        prNumber: r.pr_number,
        branch: r.branch,
        awsSecretId: r.aws_secret_id,
        awsSecretDeleted: r.aws_secret_deleted,
        dnsSkipped: r.dns_skipped,
        dnsDeleted: r.dns_deleted,
        dnsRecord: r.dns_record,
        hadDbRow: r.had_db_row,
      });
      showToast(`World ${world.worldName} deletion started`, 'success');
      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Delete world"
    >
      <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full shadow-xl animate-in fade-in duration-200">
        <div className="flex items-start gap-4">
          <AlertCircle
            className="w-6 h-6 text-destructive flex-shrink-0 mt-0.5"
            strokeWidth={1.5}
          />
          <div className="flex-1">
            {!result ? (
              <>
                <h3 className="text-lg font-bold text-foreground mb-2">Delete world?</h3>
                <p className="text-foreground/60 text-sm mb-4">
                  You are about to delete{' '}
                  <span className="text-foreground font-mono">
                    {world.organization}/{world.worldName} ({world.environment})
                  </span>
                  . This will:
                </p>
                <ul className="text-xs text-foreground/60 mb-4 list-disc pl-5 space-y-1">
                  <li>Open a PR on the GitOps repo removing the world&apos;s YAMLs.</li>
                  <li>Delete the AWS secret with a 7-day recovery window.</li>
                  <li>Drop the world&apos;s row from the backoffice DB (if any).</li>
                  <li>
                    Once the PR is merged, Flux will prune the live cluster resources
                    (<code>prune: true</code>).
                  </li>
                </ul>
                <p className="text-xs text-foreground/60 mb-2">
                  Type{' '}
                  <span className="font-mono text-foreground">{expected}</span> to confirm.
                </p>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={expected}
                  className="bg-sidebar-accent/30 border-sidebar-border font-mono mb-6"
                  autoFocus
                />

                <div className="flex gap-3">
                  <Button
                    onClick={handleClose}
                    variant="outline"
                    disabled={submitting}
                    className="flex-1 border-border hover:bg-sidebar bg-transparent"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleConfirm}
                    disabled={submitting || !matches}
                    className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {submitting ? 'Deleting…' : 'Delete'}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-bold text-foreground mb-2">
                  Deletion in progress
                </h3>
                <p className="text-sm text-foreground/70 mb-4">
                  The world will be removed from the cluster after the PR is merged and Flux
                  reconciles.
                </p>
                <div className="p-4 rounded-lg bg-sidebar-accent/20 space-y-2 text-xs mb-6">
                  {result.prUrl ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-foreground/70">Pull request:</span>
                      <a
                        href={result.prUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-solar-gold hover:underline inline-flex items-center gap-1 font-mono"
                      >
                        #{result.prNumber}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  ) : (
                    <div className="flex justify-between">
                      <span className="text-foreground/70">Branch:</span>
                      <span className="font-mono text-foreground">{result.branch}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-3">
                    <span className="text-foreground/70">AWS secret:</span>
                    <span className="font-mono text-foreground text-right break-all">
                      {result.awsSecretId}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-foreground/70">Secret deleted:</span>
                    <span
                      className={
                        result.awsSecretDeleted ? 'text-emerald-400' : 'text-amber-400'
                      }
                    >
                      {result.awsSecretDeleted ? 'yes (7-day recovery)' : 'failed — check logs'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-foreground/70">DNS:</span>
                    <span
                      className={
                        result.dnsSkipped
                          ? 'text-foreground/60'
                          : result.dnsDeleted
                            ? 'text-emerald-400 font-mono'
                            : 'text-amber-400'
                      }
                    >
                      {result.dnsSkipped
                        ? 'skipped (wildcard)'
                        : result.dnsDeleted
                          ? (result.dnsRecord ?? 'removed')
                          : 'failed — check logs'}
                    </span>
                  </div>
                </div>
                <Button
                  onClick={handleClose}
                  className="w-full bg-solar-gold text-sidebar-foreground hover:bg-solar-amber"
                >
                  Done
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
