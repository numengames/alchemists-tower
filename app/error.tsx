'use client';

import { useEffect } from 'react';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[v0] Error boundary caught:', error.message);
  }, [error]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-card flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10 mb-6">
          <AlertTriangle className="w-8 h-8 text-destructive" />
        </div>

        <h1 className="text-3xl font-serif font-bold text-foreground mb-2">Something went wrong</h1>
        <p className="text-foreground/60 mb-8">An unexpected error occurred. Please try again.</p>

        {error.digest && (
          <p className="text-xs text-foreground/40 mb-8 font-mono">Error ID: {error.digest}</p>
        )}

        <div className="space-y-3">
          <Button
            onClick={reset}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold cursor-pointer"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Try again
          </Button>

          <Link href="/" className="block">
            <Button
              variant="outline"
              className="w-full border-border text-foreground hover:bg-secondary cursor-pointer bg-transparent"
            >
              <Home className="w-4 h-4 mr-2" />
              Go to Home
            </Button>
          </Link>
        </div>

        <p className="text-center text-xs text-foreground/40 mt-8">
          © 2025 Alchemists Tower. All rights reserved.
        </p>
      </div>
    </div>
  );
}
