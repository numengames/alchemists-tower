'use client';

import { useState } from 'react';
import { X, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/toast-provider';
import { cn } from '@/lib/utils';

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const initialState = {
  name: '',
  email: '',
  password: '',
  role: 'USER' as 'USER' | 'ADMIN',
};

export function CreateUserModal({ isOpen, onClose, onSuccess }: CreateUserModalProps) {
  const [form, setForm] = useState(initialState);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { showToast } = useToast();

  if (!isOpen) return null;

  const handleClose = () => {
    if (submitting) return;
    setForm(initialState);
    setShowPassword(false);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? 'Failed to create user', 'error');
        return;
      }
      showToast(`User ${form.email} created`, 'success');
      setForm(initialState);
      setShowPassword(false);
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
      <form
        onSubmit={handleSubmit}
        className="bg-sidebar border border-sidebar-border rounded-xl w-full max-w-md shadow-xl animate-in fade-in duration-200"
      >
        <div className="border-b border-sidebar-border px-6 py-5 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-foreground">Create User</h2>
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
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Name</label>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., Sera Nyx"
              className="bg-sidebar-accent/30 border-sidebar-border"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Email</label>
            <Input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="user@numengames.com"
              className="bg-sidebar-accent/30 border-sidebar-border"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Initial password
            </label>
            <div className="relative">
              <Input
                required
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="At least 8 characters"
                minLength={8}
                className="bg-sidebar-accent/30 border-sidebar-border pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-foreground/60 hover:text-foreground"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" strokeWidth={1.5} />
                ) : (
                  <Eye className="w-4 h-4" strokeWidth={1.5} />
                )}
              </button>
            </div>
            <p className="text-xs text-foreground/60 mt-1.5">
              The user will be required to change this on first login.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Role</label>
            <div className="grid grid-cols-2 gap-2">
              {(['USER', 'ADMIN'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setForm({ ...form, role: r })}
                  className={cn(
                    'p-3 rounded-lg border text-left transition-colors',
                    form.role === r
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
            type="submit"
            disabled={submitting}
            className="flex-1 bg-solar-gold text-sidebar-foreground hover:bg-solar-amber"
          >
            {submitting ? 'Creating…' : 'Create User'}
          </Button>
        </div>
      </form>
    </div>
  );
}
