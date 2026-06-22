import type { Metadata, Viewport } from 'next'
import { Syne, Space_Grotesk, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-syne',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space',
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600'],
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://taskpilot.cc'),
  title: {
    default: 'TaskPilot — Talk to any webpage instantly',
    template: '%s | TaskPilot',
  },
  description:
    'Autofill forms, extract structured data, convert webpages into documents, and automate browser work with AI. The AI operating layer for the browser.',
  keywords: [
    'AI browser extension',
    'autofill AI',
    'webpage to excel',
    'webpage to PDF',
    'AI sidebar',
    'browser automation',
    'AI Chrome extension',
    'smart paste',
    'form autofill',
    'AI productivity',
  ],
  authors: [{ name: 'TaskPilot' }],
  creator: 'TaskPilot',
  publisher: 'TaskPilot',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://taskpilot.cc',
    siteName: 'TaskPilot',
    title: 'TaskPilot — Talk to any webpage instantly',
    description:
      'The AI operating layer for the browser. Autofill, extract, automate.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'TaskPilot — AI for the Browser',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TaskPilot — Talk to any webpage instantly',
    description: 'The AI operating layer for the browser.',
    images: ['/og-image.png'],
    creator: '@taskpilotcc',
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
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  themeColor: '#070711',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${syne.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body className="bg-background text-foreground antialiased">
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // PostHog init (deferred)
              if (typeof window !== 'undefined' && '${process.env.NEXT_PUBLIC_POSTHOG_KEY}') {
                window.__PH_KEY = '${process.env.NEXT_PUBLIC_POSTHOG_KEY}';
              }
            `,
          }}
        />
      </body>
    </html>
  )
}
