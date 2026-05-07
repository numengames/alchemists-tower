'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { Activity, Boxes, Clock } from 'lucide-react';

import { Sidebar } from '@/components/sidebar';
import { TopBar } from '@/components/top-bar';
import { LogoutModal } from '@/components/logout-modal';
import { Card } from '@/components/ui/card';
import { useWorlds } from '@/lib/use-worlds';

export default function AnalyticsPage() {
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const { status } = useSession();
  const router = useRouter();
  const { worlds, loading, error: loadError, cachedAt } = useWorlds();

  useEffect(() => {
    setIsMounted(true);
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  const handleLogoutConfirm = async () => {
    setIsLogoutModalOpen(false);
    await signOut({ callbackUrl: '/login' });
  };

  if (!isMounted) return null;

  const total = worlds?.length ?? null;
  const active = worlds?.filter((w) => w.status === 'RUNNING').length ?? null;
  const idle = worlds?.filter((w) => w.status === 'IDLE').length ?? null;

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden flex-col md:flex-row">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar onSignOut={() => setIsLogoutModalOpen(true)} />
        <div className="flex-1 overflow-auto">
          <div className="p-6 md:px-20 space-y-8">
            <div>
              <h1 className="text-3xl md:text-4xl font-serif font-bold text-foreground mb-2">
                Analytics
              </h1>
              <p className="text-foreground/60">
                Live metrics derived from the cluster
                {cachedAt && (
                  <span className="ml-2 text-xs text-foreground/40">
                    (cached {formatCacheAge(cachedAt)})
                  </span>
                )}
              </p>
            </div>

            {loadError && (
              <Card className="p-4 border border-red-500/30 bg-red-500/5 text-sm text-red-300">
                Failed to load worlds: {loadError}
              </Card>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <MetricCard
                icon={Boxes}
                label="Total Worlds"
                value={total}
                loading={loading}
                hint="HelmReleases across every org namespace"
              />
              <MetricCard
                icon={Activity}
                label="Active Now"
                value={active}
                loading={loading}
                hint="Pods serving traffic (Knative Ready, replicas ≥ 1)"
                highlight
              />
              <MetricCard
                icon={Clock}
                label="Idle (scaled to zero)"
                value={idle}
                loading={loading}
                hint="Provisioned but currently scaled to zero"
              />
            </div>

            <Card className="p-8 border border-dashed border-border bg-card/40 text-center">
              <p className="text-sm text-foreground/70 font-medium">More metrics coming soon</p>
              <p className="text-xs text-foreground/50 mt-1">
                Cost (MTD + forecast), per-world activity, deploy frequency, error rate.
              </p>
            </Card>
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

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  loading = false,
  highlight = false,
}: {
  icon: typeof Activity;
  label: string;
  value: number | null;
  hint: string;
  loading?: boolean;
  highlight?: boolean;
}) {
  const showSkeleton = loading && value === null;
  return (
    <Card className="p-6 bg-card border border-border rounded-xl">
      <div className="flex items-start justify-between mb-2">
        <p className="text-sm text-foreground/60">{label}</p>
        <Icon
          className={`w-4 h-4 ${highlight ? 'text-primary' : 'text-foreground/40'}`}
          strokeWidth={1.75}
        />
      </div>
      {showSkeleton ? (
        <div className="h-9 w-16 bg-sidebar-accent/40 rounded animate-pulse" />
      ) : (
        <p
          className={`text-3xl font-bold ${
            highlight ? 'text-primary' : 'text-foreground'
          }`}
        >
          {value ?? '—'}
        </p>
      )}
      <p className="text-xs text-foreground/50 mt-2">{hint}</p>
    </Card>
  );
}

function formatCacheAge(ts: number): string {
  const diffSec = Math.round((Date.now() - ts) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  return `${diffHr}h ago`;
}
