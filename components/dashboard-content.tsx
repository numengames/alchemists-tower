'use client';

import { Zap, Pause, RotateCcw, Plus } from 'lucide-react';
import { WorldCard } from '@/components/world-card';
import { StatsCard } from '@/components/stats-card';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

interface DashboardContentProps {
  onCreateClick: () => void;
}

const mockWorlds = [
  {
    id: '1',
    name: 'Alpha Genesis',
    environment: 'production',
    version: 'v2.4.1',
    status: 'active' as const,
    owner: 'Sera Nyx',
    createdDate: '2024-10-15',
    description: 'Primary world instance for live ecosystem',
  },
  {
    id: '2',
    name: 'Echo Chamber',
    environment: 'development',
    version: 'v2.4.0',
    status: 'paused' as const,
    owner: 'Kai Storm',
    createdDate: '2024-10-12',
    description: 'Testing environment for new features',
  },
  {
    id: '3',
    name: 'Nexus Prime',
    environment: 'production',
    version: 'v2.3.9',
    status: 'active' as const,
    owner: 'Raze',
    createdDate: '2024-09-28',
    description: 'Secondary production world',
  },
  {
    id: '4',
    name: 'Void Realm',
    environment: 'development',
    version: 'v2.4.1-beta',
    status: 'updating' as const,
    owner: 'Luna Code',
    createdDate: '2024-11-01',
    description: 'Development sandbox for experiments',
  },
];

export function DashboardContent({ onCreateClick }: DashboardContentProps) {
  const [activeFilter, setActiveFilter] = useState<string>('All');

  const filteredWorlds = mockWorlds.filter((world) => {
    if (activeFilter === 'All') return true;
    return world.status === activeFilter.toLowerCase();
  });

  return (
    <main className="flex-1 overflow-auto bg-background">
      <div className="p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-foreground mb-2">Worlds</h2>
            <p className="text-foreground/60">Manage your virtual worlds across all environments</p>
          </div>
          <Button
            onClick={onCreateClick}
            className="bg-solar-gold text-sidebar-foreground hover:bg-solar-amber"
          >
            <Plus className="w-4 h-4 mr-2" /> Create New World
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <StatsCard label="Total Worlds" value="4" icon={Zap} />
          <StatsCard label="Active" value="2" icon={Zap} />
          <StatsCard label="Paused" value="1" icon={Pause} />
          <StatsCard label="Updating" value="1" icon={RotateCcw} />
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-8">
          {['All', 'Active', 'Paused', 'Updating'].map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors cursor-pointer ${
                filter === activeFilter
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-sidebar-accent/30 text-foreground hover:bg-sidebar-accent/50'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>

        {/* Worlds Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredWorlds.map((world) => (
            <WorldCard key={world.id} {...world} />
          ))}
        </div>

        {/* Empty State Helper */}
        {filteredWorlds.length === 0 && (
          <div className="text-center py-16">
            <p className="text-foreground/60 mb-4">No worlds found. Start by creating a new one.</p>
            <Button
              onClick={onCreateClick}
              className="bg-solar-gold text-sidebar-foreground hover:bg-solar-amber"
            >
              <Plus className="w-4 h-4 mr-2" /> Create First World
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
