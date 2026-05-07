'use client';

import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/toast-provider';

export interface DeleteUserTarget {
  id: string;
  email: string;
  name: string;
}

interface DeleteUserModalProps {
  isOpen: boolean;
  user: DeleteUserTarget | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function DeleteUserModal({ isOpen, user, onClose, onSuccess }: DeleteUserModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const { showToast } = useToast();

  if (!isOpen || !user) return null;

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? 'Failed to delete user', 'error');
        return;
      }
      showToast(`User ${user.email} deleted`, 'success');
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
      <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full shadow-xl animate-in fade-in duration-200">
        <div className="flex items-start gap-4">
          <AlertCircle className="w-6 h-6 text-destructive flex-shrink-0 mt-0.5" strokeWidth={1.5} />
          <div className="flex-1">
            <h3 className="text-lg font-bold text-foreground mb-2">Delete user?</h3>
            <p className="text-foreground/60 text-sm mb-6">
              You are about to permanently delete{' '}
              <span className="text-foreground font-medium">{user.name}</span>{' '}
              <span className="text-foreground/70">({user.email})</span>. This action cannot be
              undone.
            </p>

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
                disabled={submitting}
                className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {submitting ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
