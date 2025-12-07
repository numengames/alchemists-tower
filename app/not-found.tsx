import { Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-card flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="text-6xl font-serif font-bold text-foreground/20 mb-4">404</div>

        <h1 className="text-3xl font-serif font-bold text-foreground mb-2">Page not found</h1>
        <p className="text-foreground/60 mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>

        <Link href="/dashboard" className="inline-block">
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold cursor-pointer">
            <Home className="w-4 h-4 mr-2" />
            Go to Dashboard
          </Button>
        </Link>

        <p className="text-center text-xs text-foreground/40 mt-8">
          © 2025 Khepri Forge. All rights reserved.
        </p>
      </div>
    </div>
  );
}
