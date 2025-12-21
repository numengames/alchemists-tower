'use client';

import { useState, useEffect } from 'react';
import { X, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/toast-provider';
import Image from 'next/image';

interface Enable2FAModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (backupCodes: string[]) => void;
}

export function Enable2FAModal({ isOpen, onClose, onSuccess }: Enable2FAModalProps) {
  const [step, setStep] = useState<'qr' | 'backup'>('qr');
  const [secret, setSecret] = useState('');
  const [qrCode, setQRCode] = useState('');
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedBackup, setCopiedBackup] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (isOpen) {
      // Generate QR code and secret
      fetch('/api/user/2fa/generate-secret')
        .then((res) => res.json())
        .then((data) => {
          setSecret(data.secret);
          setQRCode(data.qrCode);
        })
        .catch(() => showToast('Failed to generate QR code', 'error'));
    }
  }, [isOpen, showToast]);

  const handleVerify = async () => {
    if (code.length !== 6) {
      showToast('Please enter a 6-digit code', 'error');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/user/2fa/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });

      if (response.ok) {
        const data = await response.json();
        setBackupCodes(data.backupCodes);
        setStep('backup');
        showToast('2FA enabled successfully!', 'success');
      } else {
        const data = await response.json();
        showToast(data.error || 'Invalid code', 'error');
      }
    } catch (error) {
      showToast('An error occurred', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinish = () => {
    onSuccess(backupCodes);
    onClose();
    setStep('qr');
    setCode('');
  };

  const copySecret = () => {
    navigator.clipboard.writeText(secret);
    setCopiedSecret(true);
    showToast('Secret copied!', 'success');
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join('\n'));
    setCopiedBackup(true);
    showToast('Backup codes copied!', 'success');
    setTimeout(() => setCopiedBackup(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-card border border-border rounded-2xl p-8 max-w-md w-full shadow-2xl relative">
        {step === 'qr' && (
          <>
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-foreground/40 hover:text-foreground/60"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-2xl font-serif font-bold text-foreground mb-2">
              Enable Two-Factor Authentication
            </h2>
            <p className="text-sm text-foreground/60 mb-6">
              Scan this QR code with your authenticator app
            </p>

            {/* QR Code */}
            {qrCode && (
              <div className="flex justify-center mb-4">
                <div className="bg-white p-4 rounded-lg">
                  <Image src={qrCode} alt="QR Code" width={200} height={200} />
                </div>
              </div>
            )}

            {/* Manual entry */}
            <div className="mb-6">
              <p className="text-xs text-foreground/60 mb-2">Or enter this code manually:</p>
              <div className="flex items-center gap-2 bg-sidebar p-3 rounded-lg border border-border">
                <code className="flex-1 text-sm font-mono text-foreground break-all">{secret}</code>
                <button
                  onClick={copySecret}
                  className="p-2 hover:bg-background rounded-lg transition-colors"
                >
                  {copiedSecret ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4 text-foreground/60" />
                  )}
                </button>
              </div>
            </div>

            {/* Verification code */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-foreground mb-2">
                Enter 6-digit code
              </label>
              <Input
                type="text"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="text-center text-lg tracking-widest"
              />
            </div>

            <Button
              onClick={handleVerify}
              className="w-full bg-primary hover:bg-primary/90"
              disabled={isLoading || code.length !== 6}
            >
              {isLoading ? 'Verifying...' : 'Verify & Enable'}
            </Button>
          </>
        )}

        {step === 'backup' && (
          <>
            <h2 className="text-2xl font-serif font-bold text-foreground mb-2">
              Save Your Backup Codes
            </h2>
            <p className="text-sm text-foreground/60 mb-6">
              Store these codes in a safe place. You can use them to access your account if you lose
              your authenticator device.
            </p>

            <div className="bg-sidebar border border-border rounded-lg p-4 mb-4">
              <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                {backupCodes.map((code, i) => (
                  <div key={i} className="text-foreground">
                    {code}
                  </div>
                ))}
              </div>
            </div>

            <Button onClick={copyBackupCodes} variant="outline" className="w-full mb-4">
              {copiedBackup ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy All Codes
                </>
              )}
            </Button>

            <Button onClick={handleFinish} className="w-full bg-primary hover:bg-primary/90">
              Done
            </Button>

            <p className="text-xs text-destructive text-center mt-4">
              ⚠️ You won't be able to see these codes again!
            </p>
          </>
        )}
      </div>
    </div>
  );
}
