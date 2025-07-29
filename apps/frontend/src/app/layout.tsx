import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PUNCH⏰CLOCK - Enterprise Workforce Management',
  description: 'Modern workforce orchestration platform with AI-powered automation, multi-tenant architecture, and enterprise-grade security.',
  keywords: ['workforce management', 'attendance tracking', 'AI assistant', 'multi-tenant', 'enterprise', 'hr automation'],
  authors: [{ name: 'W3JDev Technologies' }],
  openGraph: {
    title: 'PUNCH⏰CLOCK - Enterprise Workforce Management',
    description: 'Transform your workforce management with AI-powered automation and enterprise-grade security.',
    url: 'https://punchclock.w3jdev.com',
    siteName: 'PUNCH⏰CLOCK',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'PUNCH⏰CLOCK Dashboard',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PUNCH⏰CLOCK - Enterprise Workforce Management',
    description: 'Transform your workforce management with AI-powered automation.',
    images: ['/twitter-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <main>{children}</main>
      </body>
    </html>
  )
}