'use client';

import { ExternalLink, Trash2, Activity, Moon, AlertTriangle, AlertCircle, RefreshCw, HelpCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { World, WorldStatus } from '@/lib/k8s';
import { cn } from '@/lib/utils';

interface WorldCardProps {
  world: World;
  isAdmin: boolean;
  onDelete?: (world: World) => void;
}

const STATUS_META: Record<
  WorldStatus,
  { label: string; icon: LucideIcon; tone: string; border: string; pulse?: boolean }
> = {
  RUNNING: {
    label: 'Running',
    icon: Activity,
    tone: 'bg-emerald-500/15 text-emerald-400',
    border: 'border-emerald-500/30',
  },
  IDLE: {
    label: 'Idle',
    icon: Moon,
    tone: 'bg-sidebar-accent/40 text-foreground/70',
    border: 'border-sidebar-border',
  },
  UPDATING: {
    label: 'Updating',
    icon: RefreshCw,
    tone: 'bg-blue-500/15 text-blue-400',
    border: 'border-blue-500/30',
    pulse: true,
  },
  DEGRADED: {
    label: 'Degraded',
    icon: AlertTriangle,
    tone: 'bg-amber-500/15 text-amber-400',
    border: 'border-amber-500/30',
  },
  ERROR: {
    label: 'Error',
    icon: AlertCircle,
    tone: 'bg-red-500/15 text-red-400',
    border: 'border-red-500/30',
  },
  UNKNOWN: {
    label: 'Unknown',
    icon: HelpCircle,
    tone: 'bg-sidebar-accent/40 text-foreground/60',
    border: 'border-sidebar-border',
  },
};

export function WorldCard({ world, isAdmin, onDelete }: WorldCardProps) {
  const meta = STATUS_META[world.status];
  const StatusIcon = meta.icon;

  return (
    <div
      className={cn(
        'relative bg-sidebar/50 border rounded-xl p-4 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:border-primary/40',
        meta.border,
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="text-base font-semibold text-foreground truncate">{world.worldName}</h3>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-sidebar-accent/50 text-foreground/70 uppercase">
              {world.environment}
            </span>
          </div>
          <p className="text-xs text-foreground/55 truncate">{world.organization}</p>
        </div>

        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0',
            meta.tone,
          )}
          title={world.statusReason}
        >
          <StatusIcon
            className={cn('w-3 h-3', meta.pulse && 'animate-spin')}
            strokeWidth={2}
          />
          {meta.label}
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs text-foreground/55 mb-4 flex-wrap">
        {world.chartVersion && (
          <span className="font-mono">v{world.chartVersion}</span>
        )}
        {world.url && (
          <span className="truncate" title={world.url}>
            {world.url.replace(/^https?:\/\//, '')}
          </span>
        )}
      </div>

      <div className="flex gap-2">
        {world.url ? (
          <a
            href={world.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md border border-sidebar-border text-foreground hover:border-primary/50 hover:bg-primary/10 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.75} />
            Open
          </a>
        ) : (
          <span className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-1.5 text-xs rounded-md border border-sidebar-border/50 text-foreground/40">
            No URL
          </span>
        )}

        {isAdmin && onDelete && (
          <button
            onClick={() => onDelete(world)}
            className="inline-flex items-center justify-center px-2.5 py-1.5 rounded-md text-foreground/60 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            aria-label={`Delete ${world.worldName}`}
            title="Delete world"
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
          </button>
        )}
      </div>
    </div>
  );
}
