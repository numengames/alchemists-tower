'use client'

import { useState, useEffect } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, ArrowRight, AlertCircle, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { KhepriLogo } from '@/components/khepri-logo'

interface ErrorDetails {
  type: 'invalid' | 'locked' | 'suspended' | 'generic'
  message: string
  remainingAttempts?: number
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<ErrorDetails | null>(null)
  const [mounted, setMounted] = useState(false)
  const router = useRouter()

  useEffect(() => {
    setMounted(true)
  }, [])

  const parseError = (errorMessage: string): ErrorDetails => {
    if (!errorMessage) {
      return { type: 'generic', message: 'An unexpected error occurred' }
    }

    const parts = errorMessage.split('||')
    
    if (parts.length === 2) {
      const [type, message] = parts
      
      const attemptsMatch = message.match(/(\d+) attempts? remaining/)
      const remainingAttempts = attemptsMatch ? parseInt(attemptsMatch[1]) : undefined

      switch (type) {
        case 'INVALID':
          return { type: 'invalid', message, remainingAttempts }
        case 'LOCKED':
          return { type: 'locked', message }
        case 'SUSPENDED':
          return { type: 'suspended', message }
        default:
          return { type: 'generic', message }
      }
    }

    return { type: 'generic', message: errorMessage }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        setError(parseError(result.error))
        setIsLoading(false)
        return
      }

      if (result?.ok) {
        router.push('/dashboard')
        router.refresh()
      }
    } catch (err) {
      setError({ type: 'generic', message: 'An unexpected error occurred' })
      setIsLoading(false)
    }
  }

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-card flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 rounded-full bg-muted animate-pulse" />
            </div>
            <div className="h-8 bg-muted rounded w-48 mx-auto mb-2 animate-pulse" />
            <div className="h-4 bg-muted rounded w-32 mx-auto animate-pulse" />
          </div>
          <div className="bg-card border border-border rounded-2xl p-8 shadow-xl">
            <div className="space-y-6">
              <div className="h-10 bg-muted rounded animate-pulse" />
              <div className="h-10 bg-muted rounded animate-pulse" />
              <div className="h-10 bg-muted rounded animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-card flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="flex justify-center mb-6">
            <KhepriLogo size={64} />
          </div>
          <h1 className="text-3xl font-serif font-bold text-foreground mb-2">Khepri Forge</h1>
          <p className="text-foreground/60">Where worlds rise again</p>
        </div>

        {/* Login Card */}
        <div className="bg-card border border-border rounded-2xl p-8 shadow-xl">
          <form onSubmit={handleLogin} className="space-y-6">
            {error && (
              <div
                className={`p-4 rounded-lg border-2 flex items-start gap-3 ${
                  error.type === 'locked'
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                    : error.type === 'suspended'
                    ? 'bg-destructive/10 border-destructive/30 text-destructive'
                    : 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
                }`}
              >
                {error.type === 'locked' ? (
                  <Lock className="w-5 h-5 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium">{error.message}</p>
                  {error.remainingAttempts !== undefined && error.remainingAttempts > 0 && (
                    <p className="text-xs mt-1 opacity-80">
                      {error.remainingAttempts} {error.remainingAttempts === 1 ? 'attempt' : 'attempts'} remaining before temporary lock.
                    </p>
                  )}
                </div>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
                Email Address
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-foreground mb-2">
                Password
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                  disabled={isLoading}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground/60 transition-colors"
                  disabled={isLoading}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 transition-colors"
              disabled={isLoading || !email || !password}
            >
              {isLoading ? (
                <>
                  <span className="animate-pulse">Signing in...</span>
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-border">
            <p className="text-center text-sm text-foreground/60">
              Need access? <span className="text-primary font-medium">Contact administrator</span>
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-foreground/40 mt-8">
          © 2025 Khepri Forge. All rights reserved.
        </p>
      </div>
    </div>
  )
}