'use client';

import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface LogoutModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function LogoutModal({ isOpen, onConfirm, onCancel }: LogoutModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full shadow-xl animate-in fade-in duration-200">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <AlertCircle className="w-6 h-6 text-destructive mt-0.5" strokeWidth={1.5} />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-foreground mb-2">Sign out?</h3>
            <p className="text-foreground/60 text-sm mb-6">
              Are you sure you want to sign out? You'll need to sign in again to access your worlds.
            </p>

            <div className="flex gap-3">
              <Button
                onClick={onCancel}
                variant="outline"
                className="flex-1 cursor-pointer border-border hover:bg-sidebar bg-transparent"
              >
                Cancel
              </Button>
              <Button
                onClick={onConfirm}
                className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
              >
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
