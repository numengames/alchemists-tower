'use client';

import { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  Lock,
  CheckCircle,
  ShieldAlert,
  Check,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { KhepriLogo } from '@/components/khepri-logo';
import { useToast } from '@/components/toast-provider';

interface ErrorDetails {
  type: 'invalid' | 'locked' | 'suspended' | 'generic';
  message: string;
  remainingAttempts?: number;
}

interface LoginAttempts {
  email: string;
  count: number;
  lastAttempt: number;
  lockedUntil?: number;
}

interface PasswordRequirements {
  minLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSymbol: boolean;
}

const STORAGE_KEY = 'login_attempts';
const LOCK_DURATION_1 = 1 * 60 * 1000; // 1 minute
const LOCK_DURATION_2 = 10 * 60 * 1000; // 10 minutes
const LOCK_DURATION_3 = 24 * 60 * 60 * 1000; // 1 day

export default function LoginPage() {
  // Login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ErrorDetails | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Rate limiting state
  const [localAttempts, setLocalAttempts] = useState(0);
  const [isLockedLocal, setIsLockedLocal] = useState(false);
  const [lockTimeRemaining, setLockTimeRemaining] = useState(0);

  // Force password change state
  const [needsPasswordChange, setNeedsPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  // Password requirements validation
  const requirements: PasswordRequirements = {
    minLength: newPassword.length >= 8,
    hasUppercase: /[A-Z]/.test(newPassword),
    hasLowercase: /[a-z]/.test(newPassword),
    hasNumber: /[0-9]/.test(newPassword),
    hasSymbol: /[!@#$%^&*(),.?":{}|<>]/.test(newPassword),
  };

  const isPasswordValid = Object.values(requirements).every(Boolean);
  const passwordsMatch = newPassword === confirmPassword && newPassword.length > 0;

  useEffect(() => {
    setMounted(true);

    // Check for messages in URL
    const unauthorized = searchParams.get('unauthorized');
    const logout = searchParams.get('logout');
    const passwordChanged = searchParams.get('password_changed');
    const nameUpdated = searchParams.get('name_updated');
    const callbackUrl = searchParams.get('callbackUrl');

    if (unauthorized === 'true') {
      setWarningMessage(
        callbackUrl ? `Please log in to access ${callbackUrl}` : 'Please log in to continue',
      );
    } else if (logout === 'success') {
      setSuccessMessage('You have been logged out successfully');
    } else if (passwordChanged === 'success') {
      setSuccessMessage('Password changed successfully. Please log in with your new password.');
    } else if (nameUpdated === 'success') {
      setSuccessMessage('Profile updated successfully');
    }

    const timer = setTimeout(() => {
      setSuccessMessage(null);
      setWarningMessage(null);
    }, 5000);

    return () => clearTimeout(timer);
  }, [searchParams]);

  // Rate limiting logic
  useEffect(() => {
    if (!email) return;

    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return;

    try {
      const attempts: LoginAttempts = JSON.parse(stored);

      if (attempts.email !== email) {
        setLocalAttempts(0);
        setIsLockedLocal(false);
        return;
      }

      setLocalAttempts(attempts.count);

      if (attempts.lockedUntil && attempts.lockedUntil > Date.now()) {
        setIsLockedLocal(true);
        setLockTimeRemaining(attempts.lockedUntil - Date.now());

        const interval = setInterval(() => {
          const remaining = attempts.lockedUntil! - Date.now();
          if (remaining <= 0) {
            setIsLockedLocal(false);
            setLockTimeRemaining(0);
            clearInterval(interval);
            sessionStorage.removeItem(STORAGE_KEY);
            setLocalAttempts(0);
          } else {
            setLockTimeRemaining(remaining);
          }
        }, 1000);

        return () => clearInterval(interval);
      }
    } catch (e) {
      console.error('Error parsing login attempts:', e);
    }
  }, [email]);

  const recordFailedAttempt = () => {
    const newCount = localAttempts + 1;
    setLocalAttempts(newCount);

    let lockedUntil: number | undefined;

    if (newCount === 5) {
      lockedUntil = Date.now() + LOCK_DURATION_1;
    } else if (newCount === 10) {
      lockedUntil = Date.now() + LOCK_DURATION_2;
    } else if (newCount >= 15) {
      lockedUntil = Date.now() + LOCK_DURATION_3;
    }

    const attempts: LoginAttempts = {
      email,
      count: newCount,
      lastAttempt: Date.now(),
      lockedUntil,
    };

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(attempts));

    if (lockedUntil) {
      setIsLockedLocal(true);
      setLockTimeRemaining(lockedUntil - Date.now());
    }
  };

  const resetAttempts = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    setLocalAttempts(0);
    setIsLockedLocal(false);
  };

  const formatLockTime = (ms: number) => {
    const minutes = Math.ceil(ms / 1000 / 60);
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    const hours = Math.ceil(minutes / 60);
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''}`;
    const days = Math.ceil(hours / 24);
    return `${days} day${days !== 1 ? 's' : ''}`;
  };

  const parseError = (errorMessage: string): ErrorDetails => {
    if (!errorMessage) {
      return { type: 'generic', message: 'An unexpected error occurred' };
    }

    if (errorMessage.match(/Credentials/i)) {
      return { type: 'invalid', message: 'Invalid email or password' };
    }

    const parts = errorMessage.split('||');

    if (parts.length === 2) {
      const [type, message] = parts;
      const attemptsMatch = message.match(/(\d+) attempts? remaining/);
      const remainingAttempts = attemptsMatch ? parseInt(attemptsMatch[1]) : undefined;

      switch (type) {
        case 'INVALID':
          return { type: 'invalid', message, remainingAttempts };
        case 'LOCKED':
          return { type: 'locked', message };
        case 'SUSPENDED':
          return { type: 'suspended', message };
        default:
          return { type: 'generic', message };
      }
    }

    return { type: 'generic', message: errorMessage };
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setWarningMessage(null);

    if (isLockedLocal) {
      setError({
        type: 'locked',
        message: `Too many failed attempts. Try again in ${formatLockTime(lockTimeRemaining)}.`,
      });
      return;
    }

    setIsLoading(true);

    try {
      const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';

      const result = await signIn('credentials', {
        email,
        password,
        callbackUrl,
        redirect: false,
      });

      if (result?.error) {
        recordFailedAttempt();
        setError(parseError(result.error));
        setIsLoading(false);
        return;
      }

      if (result?.ok) {
        // Success - check if needs password change
        const sessionRes = await fetch('/api/auth/session');
        const sessionData = await sessionRes.json();

        if (sessionData?.user?.forcePasswordChange) {
          // Show password change form
          resetAttempts();
          setNeedsPasswordChange(true);
          setIsLoading(false);
        } else {
          // Redirect to dashboard
          resetAttempts();
          router.push(callbackUrl);
          router.refresh();
        }
      } else {
        setError({ type: 'generic', message: 'Login failed. Please try again.' });
        setIsLoading(false);
      }
    } catch (err) {
      console.error('Login error:', err);
      setError({ type: 'generic', message: 'An unexpected error occurred' });
      setIsLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isPasswordValid) {
      showToast('Password does not meet requirements', 'error');
      return;
    }

    if (!passwordsMatch) {
      showToast('Passwords do not match', 'error');
      return;
    }

    setIsChangingPassword(true);

    try {
      const response = await fetch('/api/user/force-password-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });

      if (response.ok) {
        showToast('Password changed successfully!', 'success');

        // Redirect to dashboard
        const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';
        setTimeout(() => {
          router.push(callbackUrl);
          router.refresh();
        }, 1000);
      } else {
        const data = await response.json();
        showToast(data.error || 'Failed to change password', 'error');
        setIsChangingPassword(false);
      }
    } catch (error) {
      showToast('An error occurred', 'error');
      setIsChangingPassword(false);
    }
  };

  const remainingAttempts = Math.max(0, 5 - (localAttempts % 5));

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
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-card flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="flex justify-center mb-6">
            <KhepriLogo size={64} />
          </div>
          <h1 className="text-3xl font-serif font-bold text-foreground mb-2">Alchemists Tower</h1>
          <p className="text-foreground/60">Where worlds rise again</p>
        </div>

        {/* Login/Password Change Card */}
        <div className="bg-card border border-border rounded-2xl p-8 shadow-xl">
          {!needsPasswordChange ? (
            // LOGIN FORM
            <form onSubmit={handleLogin} className="space-y-6">
              {/* Warning Message */}
              {warningMessage && (
                <div className="p-4 rounded-lg border-2 flex items-start gap-3 bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400">
                  <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <p className="text-sm font-medium">{warningMessage}</p>
                </div>
              )}

              {/* Success Message */}
              {successMessage && (
                <div className="p-4 rounded-lg border-2 flex items-start gap-3 bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400">
                  <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <p className="text-sm font-medium">{successMessage}</p>
                </div>
              )}

              {/* Error Messages */}
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
                    {error.type === 'invalid' && remainingAttempts > 0 && (
                      <p className="text-xs mt-1 opacity-80">
                        {remainingAttempts} {remainingAttempts === 1 ? 'attempt' : 'attempts'}{' '}
                        remaining before temporary lock.
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
                  disabled={isLoading || isLockedLocal}
                  required
                  autoComplete="email"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-foreground mb-2"
                >
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
                    disabled={isLoading || isLockedLocal}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground/60 transition-colors"
                    disabled={isLoading || isLockedLocal}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90"
                disabled={isLoading || isLockedLocal || !email || !password}
              >
                {isLoading ? (
                  <span className="animate-pulse">Signing in...</span>
                ) : isLockedLocal ? (
                  <>
                    <Lock className="w-4 h-4 mr-2" />
                    Locked ({formatLockTime(lockTimeRemaining)})
                  </>
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </form>
          ) : (
            // PASSWORD CHANGE FORM
            <form onSubmit={handlePasswordChange} className="space-y-6">
              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Lock className="w-6 h-6 text-amber-500" />
                </div>
                <h2 className="text-xl font-serif font-bold text-foreground mb-2">
                  Change Password Required
                </h2>
                <p className="text-sm text-foreground/60">
                  This is your first login. For security, please set a new password.
                </p>
              </div>

              {/* New Password */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  New Password
                </label>
                <div className="relative">
                  <Input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="pr-10"
                    placeholder="Enter new password"
                    required
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

              {/* Password Requirements */}
              {newPassword && (
                <div className="space-y-2 text-xs bg-sidebar/50 p-3 rounded-lg">
                  <p className="font-medium text-foreground/80 mb-2">Password must have:</p>
                  <div className="grid grid-cols-2 gap-2">
                    <RequirementItem met={requirements.minLength} text="8+ characters" />
                    <RequirementItem met={requirements.hasUppercase} text="Uppercase" />
                    <RequirementItem met={requirements.hasLowercase} text="Lowercase" />
                    <RequirementItem met={requirements.hasNumber} text="Number" />
                    <RequirementItem met={requirements.hasSymbol} text="Symbol" />
                  </div>
                </div>
              )}

              {/* Confirm Password */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Confirm New Password
                </label>
                <div className="relative">
                  <Input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pr-10"
                    placeholder="Confirm new password"
                    required
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
                {confirmPassword && !passwordsMatch && (
                  <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90"
                disabled={isChangingPassword || !isPasswordValid || !passwordsMatch}
              >
                {isChangingPassword ? (
                  <span className="animate-pulse">Changing Password...</span>
                ) : (
                  <>
                    Change Password & Continue
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>

              <p className="text-xs text-center text-foreground/60">
                We recommend enabling 2FA after your first login
              </p>
            </form>
          )}

          {/* Footer (only show on login form) */}
          {!needsPasswordChange && (
            <div className="mt-6 pt-6 border-t border-border">
              <p className="text-center text-sm text-foreground/60">
                Need access? <span className="text-primary font-medium">Contact administrator</span>
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-foreground/40 mt-8">
          © 2025 Alchemists Tower. All rights reserved.
        </p>
      </div>
    </div>
  );
}

function RequirementItem({ met, text }: { met: boolean; text: string }) {
  return (
    <div className="flex items-center gap-2">
      {met ? (
        <Check className="w-3 h-3 text-green-500" />
      ) : (
        <X className="w-3 h-3 text-foreground/30" />
      )}
      <span className={met ? 'text-green-500' : 'text-foreground/40'}>{text}</span>
    </div>
  );
}
