'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Moon, Sun, Smartphone, User, Copy, Eye, EyeOff, Lock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sidebar } from '@/components/sidebar';
import { TopBar } from '@/components/top-bar';
import { LogoutModal } from '@/components/logout-modal';
import { signOut } from 'next-auth/react';
import { useToast, Toast } from '@/components/toast';
import { Enable2FAModal } from '@/components/enable-2fa-modal';

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [nickname, setNickname] = useState('');
  const [tempNickname, setTempNickname] = useState('');
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [isSavingNickname, setIsSavingNickname] = useState(false);
  const [isTwoFAEnabled, setIsTwoFAEnabled] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [is2faModalOpen, setIs2faModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { toasts, showToast, removeToast } = useToast();

  useEffect(() => {
    setIsMounted(true);
    const currentTheme = document.documentElement.classList.contains('light') ? 'light' : 'dark';
    setTheme(currentTheme);
  }, []);

  useEffect(() => {
    if (session?.user) {
      setNickname(session.user.name || '');
      setTempNickname(session.user.name || '');
    }
  }, [session]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  const handleThemeChange = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    }
    window.dispatchEvent(new Event('storage'));
  };

  const handleNicknameSave = async () => {
    setIsSavingNickname(true);

    try {
      const response = await fetch('/api/user/update-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tempNickname }),
      });

      if (response.ok) {
        setNickname(tempNickname);
        setIsEditingNickname(false);
        router.refresh();
      } else {
        alert('Failed to update nickname');
      }
    } catch (error) {
      alert('An error occurred');
    } finally {
      setIsSavingNickname(false);
    }
  };

  const handleEnable2FA = () => {
    if (verificationCode.length === 6) {
      setIsTwoFAEnabled(true);
      setVerificationCode('');
    }
  };

  const handleDisable2FA = () => {
    setIsTwoFAEnabled(false);
  };

  const handleLogoutConfirm = async () => {
    setIsLogoutModalOpen(false);
    await signOut({ callbackUrl: '/login' });
  };

  const handlePasswordChange = async () => {
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }

    try {
      const response = await fetch('/api/user/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (response.ok) {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        showToast('Password changed successfully. You will be logged out.', 'success');

        setTimeout(() => {
          signOut({ callbackUrl: '/login?password_changed=success' });
        }, 2000);
      } else {
        const data = await response.json();
        showToast(data.error || 'Failed to change password', 'error');
      }
    } catch (error) {
      showToast('An error occurred', 'error');
    }
  };

  if (!isMounted || status === 'loading') {
    return (
      <div className="flex h-screen bg-background items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not authenticated
  if (status === 'unauthenticated') {
    return null;
  }

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar onSignOut={() => setIsLogoutModalOpen(true)} />

        <div className="flex-1 overflow-auto">
          <div className="p-6 md:px-20 space-y-8">
            {/* Page Header */}
            <div>
              <h1 className="text-3xl md:text-4xl font-serif font-bold text-foreground mb-2">
                Settings
              </h1>
              <p className="text-foreground/60">Manage your account, security, and preferences</p>
            </div>

            {/* Profile Section */}
            <div className="bg-card border border-border rounded-xl p-6 md:p-8">
              <h2 className="text-xl font-serif font-bold text-foreground mb-6 flex items-center gap-2">
                <User className="w-5 h-5 text-primary" strokeWidth={1.5} />
                Profile
              </h2>

              <div className="space-y-6">
                {/* Nickname */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-3">Nickname</label>
                  {isEditingNickname ? (
                    <div className="flex gap-2 flex-col sm:flex-row">
                      <Input
                        type="text"
                        value={tempNickname}
                        onChange={(e) => setTempNickname(e.target.value)}
                        className="flex-1"
                        autoFocus
                        disabled={isSavingNickname}
                      />
                      <Button
                        onClick={handleNicknameSave}
                        disabled={isSavingNickname || !tempNickname.trim()}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 whitespace-nowrap"
                      >
                        {isSavingNickname ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          'Save'
                        )}
                      </Button>
                      <Button
                        onClick={() => {
                          setTempNickname(nickname);
                          setIsEditingNickname(false);
                        }}
                        variant="outline"
                        className="whitespace-nowrap"
                        disabled={isSavingNickname}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-3 bg-sidebar rounded-lg border border-sidebar-border">
                      <span className="text-foreground">{nickname || 'No name set'}</span>
                      <Button
                        onClick={() => setIsEditingNickname(true)}
                        variant="outline"
                        size="sm"
                      >
                        Edit
                      </Button>
                    </div>
                  )}
                </div>

                {/* Email (Read-only) */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-3">
                    Email Address
                  </label>
                  <div className="p-3 bg-sidebar rounded-lg border border-sidebar-border text-foreground/60">
                    {session?.user?.email || 'No email'}
                  </div>
                </div>
              </div>
            </div>

            {/* Theme Section */}
            <div className="bg-card border border-border rounded-xl p-6 md:p-8">
              <h2 className="text-xl font-serif font-bold text-foreground mb-6 flex items-center gap-2">
                {theme === 'dark' ? (
                  <Moon className="w-5 h-5 text-primary" strokeWidth={1.5} />
                ) : (
                  <Sun className="w-5 h-5 text-primary" strokeWidth={1.5} />
                )}
                Theme
              </h2>

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleThemeChange('light')}
                  className={`px-4 py-2 rounded-xl border-2 transition-all ${
                    theme === 'light'
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-border/50 bg-sidebar'
                  }`}
                >
                  <Sun className="w-5 h-5 mx-auto mb-2 text-foreground" strokeWidth={1.5} />
                  <span className="text-sm font-medium text-foreground">Light</span>
                </button>

                <button
                  onClick={() => handleThemeChange('dark')}
                  className={`px-4 py-2 rounded-xl border-2 transition-all ${
                    theme === 'dark'
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-border/50 bg-sidebar'
                  }`}
                >
                  <Moon className="w-5 h-5 mx-auto mb-2 text-foreground" strokeWidth={1.5} />
                  <span className="text-sm font-medium text-foreground">Dark</span>
                </button>
              </div>
            </div>

            {/* Change Password Section */}
            <div className="bg-card border border-border rounded-xl p-6 md:p-8">
              <h2 className="text-xl font-serif font-bold text-foreground mb-6 flex items-center gap-2">
                <Lock className="w-5 h-5 text-primary" strokeWidth={1.5} />
                Change Password
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Current Password
                  </label>
                  <div className="relative">
                    <Input
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full pr-10"
                      placeholder="Enter current password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground/60"
                    >
                      {showCurrentPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    New Password
                  </label>
                  <div className="relative">
                    <Input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full pr-10"
                      placeholder="Enter new password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground/60"
                    >
                      {showNewPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <Input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full pr-10"
                      placeholder="Confirm new password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground/60"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <Button
                  onClick={handlePasswordChange}
                  disabled={!currentPassword || !newPassword || !confirmPassword}
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Update Password
                </Button>
              </div>
            </div>

            {/* 2FA Section */}
            <div className="bg-card border border-border rounded-xl p-6 md:p-8 flex flex-col md:flex-row justify-between items-center">
              <div>
                <h2 className="text-xl font-serif font-bold text-foreground mb-2 flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-primary" strokeWidth={1.5} />
                  Two-Factor Authentication
                </h2>
                <p className="text-sm text-foreground/60 mb-6">
                  Add an extra layer of security to your account
                </p>
              </div>

              <Button
                onClick={() => setIs2faModalOpen(true)}
                className="mb-6 bg-primary text-primary-foreground hover:bg-primary/90 w-48"
              >
                {isTwoFAEnabled ? 'Manage 2FA Settings' : 'Enable 2FA'}
              </Button>
            </div>
            <LogoutModal
              isOpen={isLogoutModalOpen}
              onConfirm={handleLogoutConfirm}
              onCancel={() => setIsLogoutModalOpen(false)}
            />
            <Enable2FAModal
              isOpen={is2faModalOpen}
              onClose={() => setIs2faModalOpen(false)}
              onSuccess={() => setIsTwoFAEnabled(true)}
            />
            <div className="bg-card border border-destructive/30 rounded-xl p-6 md:p-8">
              <h2 className="text-xl font-serif font-bold text-destructive mb-4">Danger Zone</h2>
              <p className="text-sm text-foreground/60 mb-4">Log out of your account</p>
              <Button
                onClick={() => setIsLogoutModalOpen(true)}
                variant="outline"
                className="w-full border-destructive/50 text-destructive hover:bg-destructive/10"
              >
                Sign Out
              </Button>
            </div>
            <div className="fixed bottom-6 right-6 z-50 space-y-2">
              {toasts.map((toast) => (
                <Toast
                  key={toast.id}
                  message={toast.message}
                  type={toast.type}
                  onClose={() => removeToast(toast.id)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
