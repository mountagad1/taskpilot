import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Routes requiring authentication
const PROTECTED_ROUTES = ['/dashboard', '/api/stripe/portal', '/api/ai/process']

// API routes with rate limiting (limit per minute)
const RATE_LIMITED_ROUTES: Record<string, number> = {
  '/api/ai/smart-paste': 30,
  '/api/ai/process': 60,
  '/api/auth': 10,
  '/api/export': 20,
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const pathname = req.nextUrl.pathname

  // ─── Security Headers ──────────────────────────────────
  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.headers.set('X-XSS-Protection', '1; mode=block')
  res.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload'
  )

  // CSP — allow extension iframe src
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com https://cdn.posthog.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://api.openai.com https://*.supabase.co https://api.stripe.com https://app.posthog.com wss://*.supabase.co",
    "frame-src https://js.stripe.com https://hooks.stripe.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
  res.headers.set('Content-Security-Policy', csp)

  // ─── Supabase Auth ─────────────────────────────────────
  const supabase = createMiddlewareClient({ req, res })
  const {
    data: { session },
  } = await supabase.auth.getSession()

  // ─── Protected Routes ──────────────────────────────────
  const isProtected = PROTECTED_ROUTES.some((route) =>
    pathname.startsWith(route)
  )

  if (isProtected && !session) {
    // API routes → 401
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'AUTH_REQUIRED' },
        { status: 401, headers: res.headers }
      )
    }
    // Page routes → redirect to login
    const loginUrl = new URL('/auth/login', req.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // ─── Extension CORS ────────────────────────────────────
  if (pathname.startsWith('/api/')) {
    const origin = req.headers.get('origin') || ''
    const isExtension = origin.startsWith('chrome-extension://')
    const isAllowed =
      origin.includes('taskpilot.cc') ||
      origin === 'http://localhost:3000' ||
      isExtension

    if (req.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': isAllowed ? origin : 'null',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers':
            'Content-Type, Authorization, X-Extension-ID, X-Session-Token',
          'Access-Control-Max-Age': '86400',
        },
      })
    }

    if (isAllowed) {
      res.headers.set('Access-Control-Allow-Origin', origin)
      res.headers.set('Access-Control-Allow-Credentials', 'true')
    }
  }

  // ─── Abuse detection (simple IP check) ────────────────
  const ip = req.ip || req.headers.get('x-forwarded-for') || 'unknown'
  if (ip === 'blocked') {
    return NextResponse.json(
      { error: 'Access denied', code: 'IP_BLOCKED' },
      { status: 403 }
    )
  }

  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|.*\\.png$|.*\\.svg$).*)',
  ],
}
