import type React from 'react'
import type { Metadata, Viewport } from 'next'
import { Inter, Fira_Code } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SessionProvider } from 'next-auth/react'
import { auth } from '@/lib/auth'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })
const firaCode = Fira_Code({ 
  subsets: ['latin'], 
  variable: '--font-mono', 
  weight: ['400', '500'] 
})

// Playfair Display con fallback local
const playfairDisplay = {
  variable: '--font-serif',
  className: 'font-serif',
}

export const metadata: Metadata = {
  title: 'Khepri Forge - World Management',
  description:
    'Create, manage and renew virtual worlds within the Numinia ecosystem. An open-source back-office platform inspired by ancient Egyptian mythology.',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5ede3' },
    { media: '(prefers-color-scheme: dark)', color: '#1f1919' },
  ],
  userScalable: false,
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await auth()

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${playfairDisplay.variable} ${firaCode.variable}`}
    >
      <head>
        <meta name="theme-color" content="#704225" />
        {/* Cargar Playfair Display desde CDN alternativo */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <SessionProvider session={session}>
          {children}
        </SessionProvider>
        <Analytics />
      </body>
    </html>
  )
}