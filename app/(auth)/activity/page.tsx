'use client';

import { Sidebar } from '@/components/sidebar';
import { TopBar } from '@/components/top-bar';
import { LogoutModal } from '@/components/logout-modal';
import { Card } from '@/components/ui/card';
import {
  CheckCircle,
  AlertCircle,
  Plus,
  Edit,
  Trash2,
  Power,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { signOut, useSession } from 'next-auth/react';

const activities = [
  {
    id: 1,
    action: 'Created world',
    world: 'Paradise Realm',
    user: 'Admin User',
    timestamp: '2 hours ago',
    status: 'success',
    icon: Plus,
  },
  {
    id: 2,
    action: 'Updated configuration',
    world: 'Sacred Temple',
    user: 'Admin User',
    timestamp: '4 hours ago',
    status: 'success',
    icon: Edit,
  },
  {
    id: 3,
    action: 'Paused world',
    world: 'Sleeping Giants',
    user: 'System',
    timestamp: '6 hours ago',
    status: 'warning',
    icon: Power,
  },
  {
    id: 4,
    action: 'Deleted world',
    world: 'Old Archive',
    user: 'Admin User',
    timestamp: '1 day ago',
    status: 'success',
    icon: Trash2,
  },
];

const ITEMS_PER_PAGE = 5;

export default function ActivityPage() {
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    setIsMounted(true);
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  const handleLogoutConfirm = async () => {
    setIsLogoutModalOpen(false);
    localStorage.removeItem('auth_token');
    await signOut({ callbackUrl: '/login' });
  };

  const totalPages = Math.ceil(activities.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentActivities = activities.slice(startIndex, endIndex);

  if (!isMounted) {
    return null;
  }

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
              <p className="text-foreground/60">Track all changes and actions in your worlds</p>
            </div>

            <div className="space-y-3">
              {currentActivities.map((activity) => {
                const Icon = activity.icon;
                const isSuccess = activity.status === 'success';
                return (
                  <Card
                    key={activity.id}
                    className="p-4 bg-card border border-border rounded-xl hover:bg-card/80 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                          isSuccess ? 'bg-primary/10' : 'bg-yellow-500/10'
                        }`}
                      >
                        <Icon
                          className={`w-4 h-4 ${isSuccess ? 'text-primary' : 'text-yellow-500'}`}
                          strokeWidth={1.5}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-0.5 gap-1">
                          <p className="text-foreground font-medium text-sm">{activity.action}</p>
                          <p className="text-xs text-foreground/40 flex-shrink-0">
                            {activity.timestamp}
                          </p>
                        </div>
                        <p className="text-sm text-foreground/60 truncate">
                          <span className="font-semibold">{activity.world}</span> by {activity.user}
                        </p>
                      </div>

                      <div className="flex-shrink-0">
                        {isSuccess ? (
                          <CheckCircle className="w-4 h-4 text-green-500/60" strokeWidth={1.5} />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-yellow-500/60" strokeWidth={1.5} />
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Previous
                </Button>
                <span className="text-sm text-foreground/60">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
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
