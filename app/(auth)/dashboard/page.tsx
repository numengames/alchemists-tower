'use client';

import { useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { TopBar } from '@/components/top-bar';
import { DashboardContent } from '@/components/dashboard-content';
import { CreateWorldModal } from '@/components/create-world-modal';
import { LogoutModal } from '@/components/logout-modal';

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [worldsRefreshTick, setWorldsRefreshTick] = useState(0);

  if (status === 'loading') return null;
  if (status === 'unauthenticated') {
    router.push('/login');
    return null;
  }

  const isAdmin = session?.user?.role === 'ADMIN';

  const handleLogoutConfirm = async () => {
    setIsLogoutModalOpen(false);
    await signOut({ callbackUrl: '/login' });
  };

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden flex-col md:flex-row">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar onSignOut={() => setIsLogoutModalOpen(true)} />
        <DashboardContent
          isAdmin={isAdmin}
          onCreateClick={() => setIsCreateModalOpen(true)}
          refreshTrigger={worldsRefreshTick}
        />
        <CreateWorldModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onWorldCreated={() => setWorldsRefreshTick((n) => n + 1)}
        />
        <LogoutModal
          isOpen={isLogoutModalOpen}
          onConfirm={handleLogoutConfirm}
          onCancel={() => setIsLogoutModalOpen(false)}
        />
      </div>
    </div>
  );
}
