'use client';

import type { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
}

export function StatsCard({ label, value, icon: Icon }: StatsCardProps) {
  return (
    <div className="bg-sidebar/50 border border-sidebar-border rounded-lg p-4 hover:border-accent/50 transition-colors">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-foreground/60 mb-1">{label}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
        </div>
        <div className="p-2.5 rounded-lg bg-accent/10">
          <Icon className="w-6 h-6 text-accent" strokeWidth={1.5} />
        </div>
      </div>
    </div>
  );
}
