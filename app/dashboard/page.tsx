'use client';

import { Sidebar } from '@/components/sidebar';
import { TopBar } from '@/components/top-bar';
import { DashboardContent } from '@/components/dashboard-content';
import { CreateWorldModal } from '@/components/create-world-modal';
import { LogoutModal } from '@/components/logout-modal';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setIsMounted(true);
    // Check if user is authenticated
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
        <TopBar
          onCreateClick={() => setIsCreateModalOpen(true)}
          onSignOut={() => setIsLogoutModalOpen(true)}
          showCreateButton={true}
        />
        <DashboardContent onCreateClick={() => setIsCreateModalOpen(true)} />
        <CreateWorldModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />
        <LogoutModal
          isOpen={isLogoutModalOpen}
          onConfirm={handleLogoutConfirm}
          onCancel={() => setIsLogoutModalOpen(false)}
        />
      </div>
    </div>
  );
}
