'use client';

import { useEffect, useState } from 'react';
import { Copy, KeyRound, Loader2, ShieldAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/toast-provider';
import type { World } from '@/lib/k8s';

interface AdminCodeModalProps {
  isOpen: boolean;
  world: World | null;
  onClose: () => void;
}

export function AdminCodeModal({ isOpen, world, onClose }: AdminCodeModalProps) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adminCode, setAdminCode] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !world) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setAdminCode(null);
    const params = new URLSearchParams({
      org: world.organization,
      world: world.worldName,
      env: world.environment,
    });
    fetch(`/api/worlds/admin-code?${params.toString()}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        return body as { adminCode: string };
      })
      .then((data) => {
        if (cancelled) return;
        setAdminCode(data.adminCode);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, world]);

  if (!isOpen || !world) return null;

  const copy = () => {
    if (!adminCode) return;
    void navigator.clipboard
      .writeText(adminCode)
      .then(() => showToast('Admin code copied', 'success'))
      .catch(() => showToast('Failed to copy', 'error'));
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="View admin code"
    >
      <Card className="bg-card border border-border rounded-xl p-6 max-w-md w-full shadow-xl animate-in fade-in duration-200">
        <div className="flex items-start gap-4">
          <KeyRound
            className="w-6 h-6 text-solar-gold flex-shrink-0 mt-0.5"
            strokeWidth={1.5}
          />
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-foreground mb-2">
              Admin code
            </h3>
            <p className="text-sm text-foreground/60 mb-4 font-mono break-all">
              {world.organization}/{world.worldName} ({world.environment})
            </p>

            {loading && (
              <div className="flex items-center gap-2 text-sm text-foreground/60 mb-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                Reading from AWS Secrets Manager…
              </div>
            )}

            {error && (
              <div className="text-sm text-red-400 mb-4">
                {error}
              </div>
            )}

            {adminCode && (
              <>
                <button
                  onClick={copy}
                  className="w-full font-mono text-2xl tracking-wider text-foreground bg-sidebar-accent/30 border border-sidebar-border rounded-lg py-4 hover:bg-sidebar-accent/40 transition-colors flex items-center justify-center gap-3 mb-3"
                  aria-label="Copy admin code"
                >
                  {adminCode}
                  <Copy className="w-4 h-4 text-foreground/60" />
                </button>
                <div className="flex items-start gap-2 text-xs text-amber-500/80 mb-4">
                  <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>
                    Reading the admin code is audit-logged. Treat this value as
                    sensitive — do not paste in chats.
                  </span>
                </div>
              </>
            )}

            <div className="flex justify-end">
              <Button
                onClick={onClose}
                variant="outline"
                className="border-border hover:bg-sidebar bg-transparent"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
