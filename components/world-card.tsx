'use client';

import { MoreVertical, Zap, Clock, User, GitBranch, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface WorldCardProps {
  id: string;
  name: string;
  environment: string;
  version: string;
  status: 'active' | 'paused' | 'updating' | 'failed';
  owner: string;
  createdDate: string;
  description: string;
}

const statusConfig = {
  active: {
    label: 'Active',
    color: 'bg-emerald-500/20 text-emerald-400',
    borderColor: 'border-emerald-500/30',
  },
  paused: {
    label: 'Paused',
    color: 'bg-primary/20 text-foreground',
    borderColor: 'border-sidebar-border',
  },
  updating: {
    label: 'Updating',
    color: 'bg-primary/20 text-foreground animate-pulse',
    borderColor: 'border-primary/30',
  },
  failed: {
    label: 'Failed',
    color: 'bg-red-500/20 text-red-400',
    borderColor: 'border-red-500/30',
  },
};

const envConfig = {
  production: 'Pro',
  staging: 'Stg',
  development: 'Dev',
};

export function WorldCard({
  id,
  name,
  environment,
  version,
  status,
  owner,
  createdDate,
  description,
}: WorldCardProps) {
  const statusInfo = statusConfig[status];

  return (
    <div
      className={cn(
        'group bg-sidebar/50 border rounded-xl p-4 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 cursor-pointer',
        statusInfo.borderColor,
        'hover:border-primary/50',
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/20 to-transparent rounded-t-xl"></div>

      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-semibold text-foreground">{name}</h3>
            <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-sidebar-accent/50 text-foreground/70">
              {envConfig[environment as keyof typeof envConfig]}
            </span>
          </div>
          <p className="text-sm text-foreground/60">{description}</p>
        </div>
        <button className="opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-sidebar-accent/30 rounded-lg cursor-pointer">
          <MoreVertical className="w-4 h-4 text-foreground/60" strokeWidth={1.5} />
        </button>
      </div>

      {/* Status Badge */}
      <div className="mb-3">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium',
            statusInfo.color,
          )}
        >
          {status === 'active' && <Zap className="w-3 h-3" strokeWidth={2} />}
          {statusInfo.label}
        </span>
      </div>

      {/* Meta Info */}
      <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
        <div className="flex items-center gap-2 text-foreground/70">
          <User className="w-4 h-4 text-primary/60" strokeWidth={1.5} />
          <span className="truncate">{owner}</span>
        </div>
        <div className="flex items-center gap-2 text-foreground/70">
          <GitBranch className="w-4 h-4 text-primary/60" strokeWidth={1.5} />
          <span className="font-mono text-xs truncate">{version}</span>
        </div>
        <div className="flex items-center gap-2 text-foreground/70 col-span-2">
          <Clock className="w-4 h-4 text-primary/60" strokeWidth={1.5} />
          <span>{new Date(createdDate).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 border-sidebar-border text-foreground hover:border-primary/50 hover:bg-primary/10 hover:text-foreground bg-transparent cursor-pointer"
        >
          Update
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 border-sidebar-border text-foreground hover:border-primary/50 hover:bg-primary/10 hover:text-foreground bg-transparent cursor-pointer"
        >
          {status === 'active' ? 'Pause' : 'Resume'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-accent hover:bg-accent/10 hover:text-foreground cursor-pointer"
        >
          <ExternalLink className="w-4 h-4" strokeWidth={1.5} />
        </Button>
      </div>
    </div>
  );
}
