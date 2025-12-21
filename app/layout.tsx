import type React from 'react';
import type { Metadata, Viewport } from 'next';
import { Inter, Fira_Code } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SessionProvider } from 'next-auth/react';
import { ToastProvider } from '@/components/toast-provider';
import { auth } from '@/lib/auth';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const firaCode = Fira_Code({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  title: 'Khepri Forge - World Management',
  description: 'Create, manage and renew virtual worlds within the Numinia ecosystem.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5ede3' },
    { media: '(prefers-color-scheme: dark)', color: '#1f1919' },
  ],
  userScalable: false,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Only load session for authenticated routes
  // Public routes (/, /login) won't have session
  const session = await auth();

  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${firaCode.variable}`}>
      <head>
        <meta name="theme-color" content="#704225" />
        {/* Load Playfair Display from CDN */}
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <SessionProvider session={session}>
          <ToastProvider>{children}</ToastProvider>
        </SessionProvider>
        <Analytics />
      </body>
    </html>
  );
}
