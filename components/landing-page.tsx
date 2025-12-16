'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { KhepriLogo } from '@/components/khepri-logo';

export function LandingPage() {
  const router = useRouter();

  const handleSignIn = () => {
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/5 flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 opacity-5 pointer-events-none">
        <div className="absolute top-10 right-10 w-40 h-40 rounded-full border border-primary/20"></div>
        <div className="absolute bottom-20 left-10 w-60 h-1 bg-primary/10"></div>
        <div className="absolute top-1/3 left-1/4 w-32 h-32 rounded-full border border-accent/10"></div>
      </div>

      <div className="relative z-10 max-w-2xl text-center space-y-8">
        {/* Logo & Header */}
        <div className="space-y-6">
          {/* Animated Khepri Logo */}
          <div className="flex justify-center">
            <KhepriLogo size={80} />
          </div>

          <div>
            <h1 className="text-5xl md:text-6xl font-serif font-bold text-foreground mb-3">
              Khepri Forge
            </h1>
            <p className="text-xl md:text-2xl text-primary font-medium">Where worlds rise again</p>
          </div>
        </div>

        {/* Description */}
        <div className="space-y-4">
          <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-xl mx-auto">
            An open-source back-office platform for creating, managing, and renewing virtual worlds
            within the Numinia ecosystem. Inspired by ancient wisdom, powered by modern clarity.
          </p>
          <div className="sacred-divider my-6"></div>
        </div>

        {/* CTA */}
        <Button
          onClick={handleSignIn}
          size="lg"
          className="px-10 py-6 text-lg font-semibold solar-glow cursor-pointer"
        >
          Sign In to Dashboard
        </Button>

        {/* Features preview */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-12 pt-8 border-t border-border">
          <div className="space-y-2">
            <div className="text-3xl font-bold text-primary">∞</div>
            <p className="text-sm text-muted-foreground">Infinite Worlds</p>
          </div>
          <div className="space-y-2">
            <div className="text-3xl font-bold text-primary">✦</div>
            <p className="text-sm text-muted-foreground">Sacred Control</p>
          </div>
          <div className="space-y-2">
            <div className="text-3xl font-bold text-primary">↻</div>
            <p className="text-sm text-muted-foreground">Eternal Renewal</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-6 text-center text-xs text-foreground/40">
        © 2025 Khepri Forge. All rights reserved.
      </div>
    </div>
  );
}
