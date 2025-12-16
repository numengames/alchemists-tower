'use client';

// This prevents hydration mismatch by separating server rendering from client state

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { TopBar } from '@/components/top-bar';
import { DashboardContent } from '@/components/dashboard-content';
import { CreateWorldModal } from '@/components/create-world-modal';
import { LogoutModal } from '@/components/logout-modal';
import { AuthProvider } from '@/components/auth-provider';

export function Dashboard() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setIsMounted(true);
    const loggedIn = localStorage.getItem('isLoggedIn') === 'true';
    if (!loggedIn) {
      router.push('/login');
    }
    setIsLoggedIn(loggedIn);
  }, [router]);

  if (!isMounted || !isLoggedIn) {
    return null;
  }

  const handleLogoutConfirm = () => {
    setIsLogoutModalOpen(false);
    localStorage.removeItem('isLoggedIn');
    router.push('/login');
  };

  return (
    <AuthProvider isLoggedIn={isLoggedIn} setIsLoggedIn={setIsLoggedIn}>
      <div className="flex h-screen bg-background text-foreground">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar
            onCreateClick={() => setIsCreateModalOpen(true)}
            onSignOut={() => setIsLogoutModalOpen(true)}
          />
          <DashboardContent onCreateClick={() => setIsCreateModalOpen(true)} />
          <CreateWorldModal
            isOpen={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
          />
          <LogoutModal
            isOpen={isLogoutModalOpen}
            onConfirm={handleLogoutConfirm}
            onCancel={() => setIsLogoutModalOpen(false)}
          />
        </div>
      </div>
    </AuthProvider>
  );
}

function LandingPage({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/5 flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute inset-0 opacity-5 pointer-events-none">
        <div className="absolute top-10 right-10 w-40 h-40 rounded-full border border-primary/20"></div>
        <div className="absolute bottom-20 left-10 w-60 h-1 bg-primary/10"></div>
      </div>

      <div className="relative z-10 max-w-2xl text-center space-y-8">
        {/* Logo & Header */}
        <div className="space-y-4">
          <div className="sun-disk w-16 h-16 mx-auto bg-primary/10 border-2 border-primary/30">
            <svg className="w-8 h-8 text-primary" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" stroke="currentColor" strokeWidth="2" />
              <line x1="12" y1="21" x2="12" y2="23" stroke="currentColor" strokeWidth="2" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="currentColor" strokeWidth="2" />
              <line
                x1="18.36"
                y1="18.36"
                x2="19.78"
                y2="19.78"
                stroke="currentColor"
                strokeWidth="2"
              />
              <line x1="1" y1="12" x2="3" y2="12" stroke="currentColor" strokeWidth="2" />
              <line x1="21" y1="12" x2="23" y2="12" stroke="currentColor" strokeWidth="2" />
            </svg>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-foreground">Khepri Forge</h1>
          <p className="text-xl text-primary font-medium">Where worlds rise again</p>
        </div>

        {/* Description */}
        <div className="space-y-4">
          <p className="text-lg text-muted-foreground leading-relaxed">
            An open-source back-office platform for creating, managing, and renewing virtual worlds
            within the Numinia ecosystem. Inspired by ancient wisdom, powered by modern clarity.
          </p>
          <div className="sacred-divider my-6"></div>
        </div>

        {/* CTA */}
        <button
          onClick={onSignIn}
          className="inline-flex items-center justify-center px-8 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors solar-glow"
        >
          Sign In
        </button>

        {/* Features preview */}
        <div className="grid grid-cols-3 gap-4 mt-12 pt-8 border-t border-border">
          <div className="space-y-2">
            <div className="text-2xl font-bold text-primary">∞</div>
            <p className="text-sm text-muted-foreground">Infinite Worlds</p>
          </div>
          <div className="space-y-2">
            <div className="text-2xl font-bold text-primary">✦</div>
            <p className="text-sm text-muted-foreground">Sacred Control</p>
          </div>
          <div className="space-y-2">
            <div className="text-2xl font-bold text-primary">↻</div>
            <p className="text-sm text-muted-foreground">Eternal Renewal</p>
          </div>
        </div>
      </div>
    </div>
  );
}
