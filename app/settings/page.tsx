'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Moon, Sun, Smartphone, User, Copy, Eye, EyeOff, Shield, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'

export default function SettingsPage() {
  const [mounted, setMounted] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  const [nickname, setNickname] = useState('Admin User')
  const [isEditingNickname, setIsEditingNickname] = useState(false)
  const [isTwoFAEnabled, setIsTwoFAEnabled] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [verificationCode, setVerificationCode] = useState('')
  const [secret, setSecret] = useState('JBSWY3DPEBLW64TMMQ======')
  const router = useRouter()

  useEffect(() => {
    setMounted(true)
    const loggedIn = localStorage.getItem('isLoggedIn') === 'true'
    if (!loggedIn) {
      router.replace('/login')
    } else {
      setIsLoggedIn(true)
    }

    // Load theme from localStorage
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
    if (savedTheme) {
      setTheme(savedTheme)
      document.documentElement.classList.toggle('dark', savedTheme === 'dark')
    }
  }, [router])

  if (!mounted || !isLoggedIn) {
    return null
  }

  const handleThemeChange = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme)
    localStorage.setItem('theme', newTheme)
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark')
      document.documentElement.classList.remove('light')
    } else {
      document.documentElement.classList.add('light')
      document.documentElement.classList.remove('dark')
    }
  }

  const handleNicknameSave = () => {
    setIsEditingNickname(false)
    // TODO: Save to API
  }

  const handleEnable2FA = () => {
    if (verificationCode.length === 6) {
      setIsTwoFAEnabled(true)
      setVerificationCode('')
      // TODO: Save to API
    }
  }

  const handleDisable2FA = () => {
    setIsTwoFAEnabled(false)
    // TODO: Save to API
  }

  return (
    <div className="flex-1 overflow-auto p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Settings</h1>
          <p className="text-foreground/60">Manage your account, security, and preferences</p>
        </div>

        <div className="space-y-6">
          {/* Profile Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Profile Information
              </CardTitle>
              <CardDescription>Update your personal details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Nickname */}
              <div className="space-y-2">
                <Label htmlFor="nickname">Nickname</Label>
                {isEditingNickname ? (
                  <div className="flex gap-2">
                    <Input
                      id="nickname"
                      type="text"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      className="flex-1"
                      autoFocus
                    />
                    <Button onClick={handleNicknameSave}>Save</Button>
                    <Button onClick={() => setIsEditingNickname(false)} variant="outline">
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-3 bg-sidebar rounded-lg border border-sidebar-border">
                    <span className="text-foreground">{nickname}</span>
                    <Button onClick={() => setIsEditingNickname(true)} variant="outline" size="sm">
                      Edit
                    </Button>
                  </div>
                )}
              </div>

              {/* Email (Read-only) */}
              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Email Address
                </Label>
                <div className="p-3 bg-sidebar rounded-lg border border-sidebar-border text-foreground/60">
                  admin@khepriforge.com
                </div>
                <p className="text-xs text-muted-foreground">Email cannot be changed</p>
              </div>
            </CardContent>
          </Card>

          {/* Security */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Security
              </CardTitle>
              <CardDescription>Manage your password</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current-password">Current Password</Label>
                <Input id="current-password" type="password" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input id="new-password" type="password" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <Input id="confirm-password" type="password" />
              </div>
              <Button>Update Password</Button>
            </CardContent>
          </Card>

          {/* Theme Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {theme === 'dark' ? (
                  <Moon className="w-5 h-5" />
                ) : (
                  <Sun className="w-5 h-5" />
                )}
                Theme
              </CardTitle>
              <CardDescription>Choose your preferred color scheme</CardDescription>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>

          {/* 2FA Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="w-5 h-5" />
                Two-Factor Authentication
              </CardTitle>
              <CardDescription>Add an extra layer of security to your account</CardDescription>
            </CardHeader>
            <CardContent>
              {!isTwoFAEnabled ? (
                <div className="space-y-6">
                  <div className="bg-sidebar/50 border border-sidebar-border rounded-lg p-4 space-y-4">
                    <p className="text-sm text-foreground/80">
                      Use an authenticator app like Google Authenticator, Microsoft Authenticator,
                      or Authy to scan this QR code:
                    </p>

                    {/* QR Code Placeholder */}
                    <div className="bg-white p-4 rounded-lg w-40 h-40 flex items-center justify-center mx-auto">
                      <div className="text-center text-gray-400">
                        <p className="text-xs">QR Code</p>
                        <p className="text-xs">(Placeholder)</p>
                      </div>
                    </div>

                    <div className="border-t border-sidebar-border pt-4 space-y-3">
                      <p className="text-sm text-foreground/80">Or enter this code manually:</p>
                      <div className="flex items-center gap-2 bg-background p-3 rounded-lg border border-border">
                        <code className="flex-1 text-sm font-mono text-foreground break-all">
                          {showSecret ? secret : '••••••••••••••••••••••••'}
                        </code>
                        <button
                          onClick={() => setShowSecret(!showSecret)}
                          className="p-2 hover:bg-sidebar rounded-lg transition-colors"
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
                          className="p-2 hover:bg-sidebar rounded-lg transition-colors"
                          aria-label="Copy secret"
                        >
                          <Copy className="w-4 h-4 text-foreground/60" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="verification-code">
                      Enter the 6-digit code from your authenticator
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="verification-code"
                        type="text"
                        placeholder="000000"
                        value={verificationCode}
                        onChange={(e) =>
                          setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                        }
                        maxLength={6}
                        className="flex-1 text-center text-lg tracking-widest"
                      />
                      <Button
                        onClick={handleEnable2FA}
                        disabled={verificationCode.length !== 6}
                        className="whitespace-nowrap"
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
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-foreground flex items-center gap-2">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                        2FA is enabled
                      </p>
                      <p className="text-sm text-foreground/60">Your account is protected</p>
                    </div>
                  </div>

                  <Button
                    onClick={handleDisable2FA}
                    variant="outline"
                    className="w-full border-destructive/50 text-destructive hover:bg-destructive/10"
                  >
                    Disable 2FA
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}