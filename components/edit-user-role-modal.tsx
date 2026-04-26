'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/toast-provider';
import { cn } from '@/lib/utils';

export interface EditUserRoleTarget {
  id: string;
  email: string;
  name: string;
  role: 'USER' | 'ADMIN';
}

interface EditUserRoleModalProps {
  isOpen: boolean;
  user: EditUserRoleTarget | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditUserRoleModal({ isOpen, user, onClose, onSuccess }: EditUserRoleModalProps) {
  const [role, setRole] = useState<'USER' | 'ADMIN'>('USER');
  const [submitting, setSubmitting] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (user) setRole(user.role);
  }, [user]);

  if (!isOpen || !user) return null;

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  const handleSubmit = async () => {
    if (role === user.role) {
      onClose();
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/users/${user.id}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? 'Failed to update role', 'error');
        return;
      }
      showToast(`${user.email} is now ${role}`, 'success');
      onSuccess();
      onClose();
    } catch {
      showToast('Network error', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-sidebar border border-sidebar-border rounded-xl w-full max-w-md shadow-xl animate-in fade-in duration-200">
        <div className="border-b border-sidebar-border px-6 py-5 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-foreground">Edit Role</h2>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 hover:bg-sidebar-accent/30 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-foreground/60" strokeWidth={1.5} />
          </button>
        </div>

        <div className="px-6 py-6 space-y-4">
          <div className="text-sm text-foreground/70">
            Updating role for{' '}
            <span className="font-medium text-foreground">{user.name}</span>
            <span className="text-foreground/50"> ({user.email})</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(['USER', 'ADMIN'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={cn(
                  'p-3 rounded-lg border text-left transition-colors',
                  role === r
                    ? 'border-solar-gold bg-solar-gold/10 text-foreground'
                    : 'border-sidebar-border text-foreground/70 hover:border-sidebar-border/60',
                )}
              >
                <div className="font-medium">{r === 'ADMIN' ? 'Admin' : 'User'}</div>
                <div className="text-xs text-foreground/50 mt-1">
                  {r === 'ADMIN' ? 'Full access' : 'Read-only'}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-sidebar-border px-6 py-4 flex gap-3">
          <Button
            type="button"
            onClick={handleClose}
            variant="outline"
            disabled={submitting}
            className="flex-1 border-sidebar-border text-foreground hover:bg-sidebar-accent/20 bg-transparent"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || role === user.role}
            className="flex-1 bg-solar-gold text-sidebar-foreground hover:bg-solar-amber"
          >
            {submitting ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
