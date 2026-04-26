'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Activity,
  Moon,
  AlertCircle,
  Boxes,
  RefreshCw,
} from 'lucide-react';
import { WorldCard } from '@/components/world-card';
import { StatsCard } from '@/components/stats-card';
import { DeleteWorldModal } from '@/components/delete-world-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { World, WorldStatus } from '@/lib/k8s';
import { useWorlds } from '@/lib/use-worlds';
import { cn } from '@/lib/utils';

type EnvFilter = 'all' | 'pre' | 'pro';
type StatusFilter = 'all' | WorldStatus;

interface DashboardContentProps {
  isAdmin: boolean;
  onCreateClick: () => void;
  /** Bump this counter to trigger a silent refresh from the parent. */
  refreshTrigger?: number;
}

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'RUNNING', label: 'Running' },
  { value: 'IDLE', label: 'Idle' },
  { value: 'UPDATING', label: 'Updating' },
  { value: 'DEGRADED', label: 'Degraded' },
  { value: 'ERROR', label: 'Error' },
];

const ENV_FILTERS: { value: EnvFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pro', label: 'Pro' },
  { value: 'pre', label: 'Pre' },
];

export function DashboardContent({
  isAdmin,
  onCreateClick,
  refreshTrigger,
}: DashboardContentProps) {
  const { worlds, loading, refreshing, error, refresh } = useWorlds(refreshTrigger);

  const [search, setSearch] = useState('');
  const [orgFilter, setOrgFilter] = useState<string>('all');
  const [envFilter, setEnvFilter] = useState<EnvFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [worldToDelete, setWorldToDelete] = useState<World | null>(null);
  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set());

  const WORLDS_PER_ORG_INITIAL = 6;
  const toggleOrgExpansion = useCallback((org: string) => {
    setExpandedOrgs((prev) => {
      const next = new Set(prev);
      if (next.has(org)) next.delete(org);
      else next.add(org);
      return next;
    });
  }, []);

  const orgs = useMemo(() => {
    if (!worlds) return [] as string[];
    return Array.from(new Set(worlds.map((w) => w.organization))).sort();
  }, [worlds]);

  const filteredWorlds = useMemo(() => {
    if (!worlds) return [];
    const q = search.trim().toLowerCase();
    return worlds.filter((w) => {
      if (orgFilter !== 'all' && w.organization !== orgFilter) return false;
      if (envFilter !== 'all' && w.environment !== envFilter) return false;
      if (statusFilter !== 'all' && w.status !== statusFilter) return false;
      if (q) {
        const haystack = `${w.worldName} ${w.organization} ${w.url ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [worlds, search, orgFilter, envFilter, statusFilter]);

  const groupedByOrg = useMemo(() => {
    const map = new Map<string, World[]>();
    for (const w of filteredWorlds) {
      const list = map.get(w.organization) ?? [];
      list.push(w);
      map.set(w.organization, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredWorlds]);

  const stats = useMemo(() => {
    if (!worlds) return { total: 0, running: 0, idle: 0, problems: 0 };
    return {
      total: worlds.length,
      running: worlds.filter((w) => w.status === 'RUNNING').length,
      idle: worlds.filter((w) => w.status === 'IDLE').length,
      problems: worlds.filter((w) => w.status === 'ERROR' || w.status === 'DEGRADED').length,
    };
  }, [worlds]);

  return (
    <main className="flex-1 overflow-auto bg-background">
      <div className="p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <h2 className="text-3xl font-bold text-foreground mb-2">Worlds</h2>
            <p className="text-foreground/60">
              Live state of every virtual world deployed on the cluster
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => refresh()}
              disabled={refreshing || loading}
              className="border-sidebar-border bg-transparent"
              aria-label="Refresh"
              title="Refresh from cluster (bypasses local cache)"
            >
              <RefreshCw
                className={cn('w-4 h-4', refreshing && 'animate-spin')}
                strokeWidth={1.75}
              />
            </Button>
            {isAdmin && (
              <Button
                onClick={onCreateClick}
                className="bg-solar-gold text-sidebar-foreground hover:bg-solar-amber"
              >
                <Plus className="w-4 h-4 mr-2" /> Create World
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatsCard label="Total" value={String(stats.total)} icon={Boxes} />
          <StatsCard label="Running" value={String(stats.running)} icon={Activity} />
          <StatsCard label="Idle" value={String(stats.idle)} icon={Moon} />
          <StatsCard label="Problems" value={String(stats.problems)} icon={AlertCircle} />
        </div>

        {/* Filters */}
        <div className="space-y-3 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40"
                strokeWidth={1.75}
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search worlds, orgs, URLs…"
                className="pl-9 bg-sidebar-accent/30 border-sidebar-border"
              />
            </div>
            <select
              value={orgFilter}
              onChange={(e) => setOrgFilter(e.target.value)}
              className="h-9 px-3 rounded-md border border-sidebar-border bg-sidebar-accent/30 text-sm text-foreground"
            >
              <option value="all">All orgs</option>
              {orgs.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-foreground/50 mr-1">Env:</span>
            {ENV_FILTERS.map((f) => (
              <FilterPill
                key={f.value}
                active={envFilter === f.value}
                onClick={() => setEnvFilter(f.value)}
                label={f.label}
              />
            ))}
            <span className="text-xs text-foreground/50 ml-3 mr-1">Status:</span>
            {STATUS_FILTERS.map((f) => (
              <FilterPill
                key={f.value}
                active={statusFilter === f.value}
                onClick={() => setStatusFilter(f.value)}
                label={f.label}
              />
            ))}
          </div>
        </div>

        {/* Body */}
        {loading && <SkeletonGrid />}

        {!loading && error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 text-center">
            <AlertCircle className="w-6 h-6 text-red-400 mx-auto mb-2" strokeWidth={1.5} />
            <p className="text-sm text-red-300">Failed to load worlds</p>
            <p className="text-xs text-foreground/60 mt-1">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refresh()}
              className="mt-4 border-red-500/40 bg-transparent text-red-300 hover:bg-red-500/10"
            >
              Try again
            </Button>
          </div>
        )}

        {!loading && !error && filteredWorlds.length === 0 && (
          <div className="text-center py-16">
            <Boxes className="w-10 h-10 text-foreground/30 mx-auto mb-3" strokeWidth={1.25} />
            <p className="text-foreground/60">
              {worlds && worlds.length > 0
                ? 'No worlds match the current filters.'
                : 'No worlds found in the cluster.'}
            </p>
          </div>
        )}

        <DeleteWorldModal
          isOpen={worldToDelete !== null}
          world={worldToDelete}
          onClose={() => setWorldToDelete(null)}
          onSuccess={() => refresh()}
        />

        {!loading && !error && groupedByOrg.length > 0 && (
          <div className="space-y-8">
            {groupedByOrg.map(([org, list]) => {
              const isExpanded = expandedOrgs.has(org);
              const visibleList =
                isExpanded || list.length <= WORLDS_PER_ORG_INITIAL
                  ? list
                  : list.slice(0, WORLDS_PER_ORG_INITIAL);
              const hidden = list.length - visibleList.length;
              return (
                <section key={org}>
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground/70">
                      {org}
                    </h3>
                    <span className="text-xs text-foreground/40">{list.length}</span>
                    <div className="flex-1 h-px bg-sidebar-border/60" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {visibleList.map((w) => (
                      <WorldCard
                        key={`${w.namespace}/${w.helmReleaseName}`}
                        world={w}
                        isAdmin={isAdmin}
                        onDelete={(world) => setWorldToDelete(world)}
                      />
                    ))}
                  </div>
                  {list.length > WORLDS_PER_ORG_INITIAL && (
                    <div className="mt-3 flex justify-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleOrgExpansion(org)}
                        className="border-sidebar-border bg-transparent text-foreground/70 hover:text-foreground"
                      >
                        {isExpanded ? 'Show less' : `Show ${hidden} more`}
                      </Button>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

function FilterPill({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer',
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-sidebar-accent/30 text-foreground/70 hover:bg-sidebar-accent/50',
      )}
    >
      {label}
    </button>
  );
}

function SkeletonGrid() {
  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <div className="h-3 w-20 bg-sidebar-accent/30 rounded animate-pulse" />
        <div className="h-3 w-6 bg-sidebar-accent/20 rounded animate-pulse" />
        <div className="flex-1 h-px bg-sidebar-border/40" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </section>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-sidebar-border bg-sidebar/40 p-4 animate-pulse">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 space-y-2">
          <div className="h-4 w-32 bg-sidebar-accent/40 rounded" />
          <div className="h-3 w-20 bg-sidebar-accent/30 rounded" />
        </div>
        <div className="h-6 w-20 bg-sidebar-accent/30 rounded-full" />
      </div>
      <div className="flex items-center gap-3 mb-4">
        <div className="h-3 w-12 bg-sidebar-accent/25 rounded" />
        <div className="h-3 w-32 bg-sidebar-accent/25 rounded" />
      </div>
      <div className="flex gap-2">
        <div className="flex-1 h-7 bg-sidebar-accent/30 rounded-md" />
        <div className="h-7 w-9 bg-sidebar-accent/20 rounded-md" />
      </div>
    </div>
  );
}
