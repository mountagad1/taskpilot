// ============================================================
// TASKPILOT API — AUTH ROUTES vs THE SHARED ADMIN CLIENT
// services/api/src/routes/auth.test.ts
//
// Regression test for a cross-user bug: sign-in used to run on the shared
// service-role client. supabase-js keeps the returned session in memory and
// then sends the USER's token instead of the service key on every later
// PostgREST call — so after the first login, "admin" queries across the whole
// process ran as that user. Supabase is faked at the fetch layer, so this
// exercises the real supabase-js token selection, not a mock of it.
// ============================================================

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

const SERVICE_KEY = 'service-role-key-for-tests'
const USER_TOKEN = 'user-access-token-for-tests'

/** Authorization header of every PostgREST request, in order. */
const restAuthHeaders: string[] = []

function fakeSupabase(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
  const json = (body: unknown) =>
    Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }))

  if (url.pathname.startsWith('/auth/v1/token')) {
    const now = Math.floor(Date.now() / 1000)
    return json({
      access_token: USER_TOKEN,
      refresh_token: 'user-refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: now + 3600,
      user: {
        id: '00000000-0000-0000-0000-0000000000aa',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'user@example.com',
        app_metadata: {},
        user_metadata: {},
        created_at: new Date().toISOString(),
      },
    })
  }

  if (url.pathname.startsWith('/rest/v1/')) {
    restAuthHeaders.push(headers.get('authorization') ?? '')
    return json(url.pathname.endsWith('/profiles') ? { plan: 'free' } : [])
  }

  return Promise.resolve(new Response('not found', { status: 404 }))
}

const savedEnv = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY }

beforeAll(() => {
  process.env.SUPABASE_URL = 'http://supabase.test'
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY
  vi.stubGlobal('fetch', vi.fn(fakeSupabase))
})

afterAll(() => {
  vi.unstubAllGlobals()
  process.env.SUPABASE_URL = savedEnv.url
  process.env.SUPABASE_SERVICE_ROLE_KEY = savedEnv.key
  if (savedEnv.url === undefined) delete process.env.SUPABASE_URL
  if (savedEnv.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
})

describe('session-creating auth calls', () => {
  it('never leave a user session on the shared service-role client', async () => {
    const { createApp } = await import('../app')
    const { getAdminClient } = await import('../lib/clients')
    const app = createApp()

    const login = await app.request(
      new Request('http://api.test/v1/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'user@example.com', password: 'correct horse' }),
      })
    )
    expect(login.status).toBe(200)
    const payload = (await login.json()) as { data?: { access_token?: string } }
    expect(JSON.stringify(payload)).toContain(USER_TOKEN)

    // An unrelated admin query after the login — e.g. another user's request.
    await getAdminClient().from('runs').select('id').limit(1)

    expect(restAuthHeaders.length).toBeGreaterThanOrEqual(2)
    // Every PostgREST call — the plan lookup inside /login and the later
    // query — must still carry the service key, never the user's token.
    for (const header of restAuthHeaders) {
      expect(header).toBe(`Bearer ${SERVICE_KEY}`)
    }
  })
})

describe('password-reset redirect', () => {
  it('only sends recovery links to our own web app', async () => {
    const { resetRedirectFor } = await import('./auth')
    const saved = process.env.PUBLIC_APP_URL
    process.env.PUBLIC_APP_URL = 'https://taskpilot.cc'
    try {
      expect(resetRedirectFor(undefined)).toBe('https://taskpilot.cc/auth/update-password')
      expect(resetRedirectFor('https://taskpilot.cc/auth/update-password?x=1')).toBe(
        'https://taskpilot.cc/auth/update-password?x=1'
      )
      expect(resetRedirectFor('https://evil.example/steal')).toBe('https://taskpilot.cc/auth/update-password')
      expect(resetRedirectFor('https://taskpilot.cc.evil.example/')).toBe('https://taskpilot.cc/auth/update-password')
      expect(resetRedirectFor('not a url')).toBe('https://taskpilot.cc/auth/update-password')
    } finally {
      if (saved === undefined) delete process.env.PUBLIC_APP_URL
      else process.env.PUBLIC_APP_URL = saved
    }
  })
})
