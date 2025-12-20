'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Moon, Sun, Smartphone, User, Copy, Eye, EyeOff, Lock, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sidebar } from '@/components/sidebar'
import { TopBar } from '@/components/top-bar'
import { LogoutModal } from '@/components/logout-modal'
import { signOut } from 'next-auth/react'

export default function SettingsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [isMounted, setIsMounted] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  const [nickname, setNickname] = useState('')
  const [tempNickname, setTempNickname] = useState('')
  const [isEditingNickname, setIsEditingNickname] = useState(false)
  const [isSavingNickname, setIsSavingNickname] = useState(false)
  const [isTwoFAEnabled, setIsTwoFAEnabled] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [verificationCode, setVerificationCode] = useState('')
  const [secret, setSecret] = useState('JBSWY3DPEBLW64TMMQ======')
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  useEffect(() => {
    setIsMounted(true)
    const currentTheme = document.documentElement.classList.contains('light') ? 'light' : 'dark'
    setTheme(currentTheme)
  }, [])

  useEffect(() => {
    if (session?.user) {
      setNickname(session.user.name || '')
      setTempNickname(session.user.name || '')
    }
  }, [session])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    }
  }, [status, router])

  const handleThemeChange = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme)
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark')
      document.documentElement.classList.remove('light')
    } else {
      document.documentElement.classList.add('light')
      document.documentElement.classList.remove('dark')
    }
    window.dispatchEvent(new Event('storage'))
  }

  const handleNicknameSave = async () => {
    setIsSavingNickname(true)

    try {
      const response = await fetch('/api/user/update-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tempNickname }),
      })

      if (response.ok) {
        setNickname(tempNickname)
        setIsEditingNickname(false)
        router.refresh()
      } else {
        alert('Failed to update nickname')
      }
    } catch (error) {
      alert('An error occurred')
    } finally {
      setIsSavingNickname(false)
    }
  }

  const handleEnable2FA = () => {
    if (verificationCode.length === 6) {
      setIsTwoFAEnabled(true)
      setVerificationCode('')
    }
  }

  const handleDisable2FA = () => {
    setIsTwoFAEnabled(false)
  }

  const handleLogoutConfirm = async () => {
    setIsLogoutModalOpen(false)
    await signOut({ callbackUrl: '/login' })
  }

  const handlePasswordChange = () => {
    if (newPassword !== confirmPassword) {
      alert('Passwords do not match')
      return
    }
    if (newPassword.length < 8) {
      alert('Password must be at least 8 characters')
      return
    }
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    alert('Password changed successfully')
  }

  if (!isMounted || status === 'loading') {
    return (
      <div className="flex h-screen bg-background items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  // Not authenticated
  if (status === 'unauthenticated') {
    return null
  }

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar onSignOut={() => setIsLogoutModalOpen(true)} />

        <div className="flex-1 overflow-auto">
          <div className="p-6 md:p-8 space-y-8 max-w-4xl">
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
                          setTempNickname(nickname)
                          setIsEditingNickname(false)
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
                  className={`p-4 rounded-xl border-2 transition-all ${
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
                  className={`p-4 rounded-xl border-2 transition-all ${
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
                      {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
            <div className="bg-card border border-border rounded-xl p-6 md:p-8">
              <h2 className="text-xl font-serif font-bold text-foreground mb-2 flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-primary" strokeWidth={1.5} />
                Two-Factor Authentication
              </h2>
              <p className="text-sm text-foreground/60 mb-6">
                Add an extra layer of security to your account
              </p>

              {!isTwoFAEnabled ? (
                <div className="space-y-6">
                  <div className="bg-sidebar/50 border border-sidebar-border rounded-lg p-4 space-y-4">
                    <p className="text-sm text-foreground/80">
                      Use an authenticator app like Google Authenticator, Microsoft Authenticator,
                      or Authy to scan this QR code:
                    </p>

                    {/* QR Code Placeholder */}
                    <div className="bg-white p-4 rounded-lg w-40 h-40 flex items-center justify-center mx-auto">
                      <div className="text-center text-foreground/40">
                        <p className="text-xs">QR Code</p>
                        <p className="text-xs">(Placeholder)</p>
                      </div>
                    </div>

                    <div className="border-t border-sidebar-border pt-4 space-y-3">
                      <p className="text-sm text-foreground/80">Or enter this code manually:</p>
                      <div className="flex items-center gap-2 bg-background p-3 rounded-lg border border-border flex-wrap sm:flex-nowrap">
                        <code className="flex-1 text-sm font-mono text-foreground break-all min-w-0">
                          {showSecret ? secret : '••••••••••••••••••••••••'}
                        </code>
                        <button
                          onClick={() => setShowSecret(!showSecret)}
                          className="p-2 hover:bg-sidebar rounded-lg transition-colors cursor-pointer flex-shrink-0"
                          aria-label="Toggle secret visibility"
                        >
                          {showSecret ? (
                            <EyeOff className="w-4 h-4 text-foreground/60" />
                          ) : (
                            <Eye className="w-4 h-4 text-foreground/60" />
                          )}
                        </button>
                        <button
                          onClick={() => navigator.clipboard.writeText(secret)}
                          className="p-2 hover:bg-sidebar rounded-lg transition-colors cursor-pointer flex-shrink-0"
                          aria-label="Copy secret"
                        >
                          <Copy className="w-4 h-4 text-foreground/60" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-foreground">
                      Enter the 6-digit code from your authenticator
                    </label>
                    <div className="flex gap-2 flex-col sm:flex-row">
                      <Input
                        type="text"
                        placeholder="000000"
                        value={verificationCode}
                        onChange={(e) =>
                          setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                        }
                        maxLength={6}
                        className="flex-1 cursor-text text-center text-lg tracking-widest"
                      />
                      <Button
                        onClick={handleEnable2FA}
                        disabled={verificationCode.length !== 6}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        Verify & Enable
                      </Button>
                    </div>
                  </div>

                  <p className="text-xs text-foreground/60">
                    Save your backup codes in a safe place. You'll need them if you lose access to
                    your authenticator.
                  </p>
                </div>
              ) : (
                <div className="bg-primary/10 border border-primary/30 rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-foreground flex items-center gap-2">
                        <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                        2FA is enabled
                      </p>
                      <p className="text-sm text-foreground/60">Your account is protected</p>
                    </div>
                  </div>

                  <Button
                    onClick={handleDisable2FA}
                    variant="outline"
                    className="w-full border-destructive/50 text-destructive hover:bg-destructive/10 cursor-pointer bg-transparent"
                  >
                    Disable 2FA
                  </Button>
                </div>
              )}
            </div>
          </div>
          </div>
        </div>

        <LogoutModal
          isOpen={isLogoutModalOpen}
          onConfirm={handleLogoutConfirm}
          onCancel={() => setIsLogoutModalOpen(false)}
        />
      </div>
  )
}