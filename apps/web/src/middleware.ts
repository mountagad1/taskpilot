import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// ============================================================
// TASKPILOT WEB — EDGE MIDDLEWARE
// apps/web/src/middleware.ts
//
// Security headers only. Since the backend split, this app holds no session
// and talks to no database: auth lives in the browser (Supabase) and
// authorisation lives in the API service. Route protection is therefore a
// client-side concern — see components/dashboard/require-auth.tsx.
//
// Middleware runs before every request, so anything that can throw here
// takes down the whole site. Keeping it to header work keeps it safe.
// ============================================================

const API_ORIGIN = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').origin
  } catch {
    return 'http://localhost:4000'
  }
})()

const SUPABASE_ORIGIN = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
      : ''
  } catch {
    return ''
  }
})()

function contentSecurityPolicy(): string {
  // The dashboard fetches the API service and Supabase directly from the
  // browser, so both origins must be in connect-src or every call is blocked.
  const connect = [
    "'self'",
    API_ORIGIN,
    SUPABASE_ORIGIN,
    SUPABASE_ORIGIN.replace(/^https:/, 'wss:'),
    'https://api.stripe.com',
    'https://app.posthog.com',
  ].filter(Boolean)

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com https://cdn.posthog.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    `connect-src ${connect.join(' ')}`,
    'frame-src https://js.stripe.com https://hooks.stripe.com',
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ')
}

export function middleware(_req: NextRequest) {
  const res = NextResponse.next()

  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
  res.headers.set('Content-Security-Policy', contentSecurityPolicy())

  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|.*\.png$|.*\.svg$|.*\.ico$).*)',
  ],
}
