'use client';

import { Sidebar } from '@/components/sidebar';
import { TopBar } from '@/components/top-bar';
import { LogoutModal } from '@/components/logout-modal';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const analyticsData = [
  { month: 'Jan', worlds: 24, active: 18, paused: 6 },
  { month: 'Feb', worlds: 32, active: 24, paused: 8 },
  { month: 'Mar', worlds: 28, active: 21, paused: 7 },
  { month: 'Apr', worlds: 45, active: 35, paused: 10 },
  { month: 'May', worlds: 52, active: 40, paused: 12 },
  { month: 'Jun', worlds: 61, active: 48, paused: 13 },
];

export default function AnalyticsPage() {
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setIsMounted(true);
    const token = localStorage.getItem('auth_token');
    if (!token) {
      router.push('/login');
    }
  }, [router]);

  const handleLogoutConfirm = () => {
    setIsLogoutModalOpen(false);
    localStorage.removeItem('auth_token');
    router.push('/login');
  };

  if (!isMounted) {
    return null;
  }

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden flex-col md:flex-row">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar onSignOut={() => setIsLogoutModalOpen(true)} />
        <div className="flex-1 overflow-auto">
          <div className="p-6 md:p-8 space-y-8 max-w-6xl">
            {/* Page Header */}
            <div>
              <h1 className="text-3xl md:text-4xl font-serif font-bold text-foreground mb-2">
                Analytics
              </h1>
              <p className="text-foreground/60">Monitor world performance and engagement metrics</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="p-6 bg-card border border-border rounded-xl">
                <p className="text-sm text-foreground/60 mb-2">Total Worlds</p>
                <p className="text-3xl font-bold text-foreground">341</p>
                <p className="text-xs text-green-500/60 mt-2">+12% from last month</p>
              </Card>
              <Card className="p-6 bg-card border border-border rounded-xl">
                <p className="text-sm text-foreground/60 mb-2">Active Now</p>
                <p className="text-3xl font-bold text-primary">289</p>
                <p className="text-xs text-foreground/60 mt-2">84% utilization</p>
              </Card>
              <Card className="p-6 bg-card border border-border rounded-xl">
                <p className="text-sm text-foreground/60 mb-2">Total Users</p>
                <p className="text-3xl font-bold text-foreground">8.3K</p>
                <p className="text-xs text-green-500/60 mt-2">+5% from last month</p>
              </Card>
              <Card className="p-6 bg-card border border-border rounded-xl">
                <p className="text-sm text-foreground/60 mb-2">Avg Response Time</p>
                <p className="text-3xl font-bold text-foreground">124ms</p>
                <p className="text-xs text-green-500/60 mt-2">-8% improvement</p>
              </Card>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="p-6 bg-card border border-border rounded-xl">
                <h2 className="text-lg font-serif font-bold text-foreground mb-4">Worlds Growth</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={analyticsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" stroke="hsl(var(--foreground))" />
                    <YAxis stroke="hsl(var(--foreground))" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="worlds"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Card>

              <Card className="p-6 bg-card border border-border rounded-xl">
                <h2 className="text-lg font-serif font-bold text-foreground mb-4">
                  Status Breakdown
                </h2>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={analyticsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" stroke="hsl(var(--foreground))" />
                    <YAxis stroke="hsl(var(--foreground))" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                      }}
                    />
                    <Legend />
                    <Bar dataKey="active" fill="hsl(var(--primary))" />
                    <Bar dataKey="paused" fill="hsl(var(--muted))" />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>
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
