'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import {
  AlertCircle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  LogIn,
  LogOut,
  Plus,
  Trash2,
  Edit,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Sidebar } from '@/components/sidebar';
import { TopBar } from '@/components/top-bar';
import { LogoutModal } from '@/components/logout-modal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type Action = 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT';
type ResourceType = 'USER' | 'WORLD' | 'SESSION';
type LogStatus = 'SUCCESS' | 'FAILURE';

interface AuditLogItem {
  id: string;
  action: Action;
  resource_type: ResourceType;
  resource_id: string | null;
  details: unknown;
  user_email: string | null;
  status: LogStatus;
  error_message: string | null;
  created_at: string;
}

interface PageData {
  items: AuditLogItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  scope?: 'all' | 'worlds-only';
}

const ACTION_ICON: Record<Action, LucideIcon> = {
  CREATE: Plus,
  UPDATE: Edit,
  DELETE: Trash2,
  LOGIN: LogIn,
  LOGOUT: LogOut,
};

const PAGE_SIZE = 10;

export default function ActivityPage() {
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    setIsMounted(true);
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/activity?page=${p}&pageSize=${PAGE_SIZE}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? body.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as PageData;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load activity');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') void load(page);
  }, [status, page, load]);

  const handleLogoutConfirm = async () => {
    setIsLogoutModalOpen(false);
    await signOut({ callbackUrl: '/login' });
  };

  if (!isMounted) return null;

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden flex-col md:flex-row">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar onSignOut={() => setIsLogoutModalOpen(true)} />
        <div className="flex-1 overflow-auto">
          <div className="p-6 md:px-20 space-y-8">
            <div>
              <h1 className="text-3xl md:text-4xl font-serif font-bold text-foreground mb-2">
                Activity Log
              </h1>
              <p className="text-foreground/60">
                {data?.scope === 'worlds-only'
                  ? 'World lifecycle events. Auth and user-management events are admin-only.'
                  : 'Every backoffice action recorded — auth events, user changes, world lifecycle.'}
              </p>
            </div>

            {loading && !data && <SkeletonList />}

            {error && (
              <Card className="p-4 border border-red-500/30 bg-red-500/5 text-sm text-red-300">
                Failed to load activity: {error}
              </Card>
            )}

            {data && data.items.length === 0 && !error && (
              <Card className="p-8 border border-dashed border-border bg-card/40 text-center">
                <p className="text-sm text-foreground/70 font-medium">No activity yet</p>
                <p className="text-xs text-foreground/50 mt-1">
                  Audit log entries appear here as users log in, manage accounts, or create worlds.
                </p>
              </Card>
            )}

            {data && data.items.length > 0 && (
              <div className="space-y-3">
                {data.items.map((item) => (
                  <ActivityRow key={item.id} item={item} />
                ))}
              </div>
            )}

            {data && data.totalPages > 1 && (
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1 || loading}
                  className="cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Previous
                </Button>
                <span className="text-sm text-foreground/60">
                  Page {data.page} of {data.totalPages} · {data.total} entries
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                  disabled={page === data.totalPages || loading}
                  className="cursor-pointer"
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            )}
          </div>
        </div>
        <LogoutModal
          isOpen={isLogoutModalOpen}
          onConfirm={handleLogoutConfirm}
          onCancel={() => setIsLogoutModalOpen(false)}
        />
      </div>
    </div>
  );
}

function ActivityRow({ item }: { item: AuditLogItem }) {
  const Icon = ACTION_ICON[item.action] ?? Edit;
  const isSuccess = item.status === 'SUCCESS';
  const subtitle = describeResource(item);
  return (
    <Card className="p-4 bg-card border border-border rounded-xl hover:bg-card/80 transition-colors">
      <div className="flex items-start gap-3">
        <div
          className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
            isSuccess ? 'bg-primary/10' : 'bg-red-500/10'
          }`}
        >
          <Icon
            className={`w-4 h-4 ${isSuccess ? 'text-primary' : 'text-red-400'}`}
            strokeWidth={1.5}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-0.5 gap-1">
            <p className="text-foreground font-medium text-sm">
              {humanAction(item.action, item.resource_type)}
            </p>
            <p className="text-xs text-foreground/40 flex-shrink-0">
              {formatRelative(item.created_at)}
            </p>
          </div>
          <p className="text-sm text-foreground/60 truncate">
            {subtitle}
            {item.user_email && (
              <span className="text-foreground/50"> — {item.user_email}</span>
            )}
          </p>
          {!isSuccess && item.error_message && (
            <p className="text-xs text-red-400 mt-1 truncate">{item.error_message}</p>
          )}
        </div>
        <div className="flex-shrink-0">
          {isSuccess ? (
            <CheckCircle className="w-4 h-4 text-green-500/60" strokeWidth={1.5} />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-500/70" strokeWidth={1.5} />
          )}
        </div>
      </div>
    </Card>
  );
}

function humanAction(action: Action, resource: ResourceType): string {
  if (action === 'LOGIN') return 'Sign in';
  if (action === 'LOGOUT') return 'Sign out';
  const verb = action === 'CREATE' ? 'Created' : action === 'UPDATE' ? 'Updated' : 'Deleted';
  const noun = resource === 'WORLD' ? 'world' : resource === 'USER' ? 'user' : 'session';
  return `${verb} ${noun}`;
}

function describeResource(item: AuditLogItem): string {
  const details = item.details as Record<string, unknown> | null;
  if (item.resource_type === 'WORLD' && details) {
    const org = typeof details.org === 'string' ? details.org : '';
    const world = typeof details.world === 'string' ? details.world : '';
    const env = typeof details.env === 'string' ? details.env : '';
    if (world && org) return `${org}/${world}${env ? ` (${env})` : ''}`;
  }
  if (item.resource_type === 'USER' && details) {
    const email =
      typeof details.created_email === 'string'
        ? details.created_email
        : typeof details.target_email === 'string'
          ? details.target_email
          : '';
    if (email) return email;
  }
  return item.resource_id ?? '—';
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.round((now - then) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
}

function SkeletonList() {
  return (
    <div className="space-y-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="h-[72px] rounded-xl border border-border bg-card/40 animate-pulse"
        />
      ))}
    </div>
  );
}
