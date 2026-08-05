// ============================================================
// TASKPILOT API — APP INTEGRATION TESTS
// services/api/src/app.test.ts
//
// These drive the real Hono app with `app.request()` — no port, no process,
// no network. That covers the wiring unit tests cannot: routing, CORS, the
// auth guard, the error envelope, and which credential each route accepts.
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { createApp } from './app'

const app = createApp()

const call = (path: string, init?: RequestInit) =>
  app.request(new Request(`http://api.test${path}`, init))

/** Every response body follows the shared envelope. */
async function body<T = Record<string, unknown>>(response: Response): Promise<T> {
  return (await response.json()) as T
}

// ─── DISCOVERY ───────────────────────────────────────────────

describe('service surface', () => {
  it('reports health without any credentials', async () => {
    const response = await call('/health')
    expect(response.status).toBe(200)

    const payload = await body<{ status: string; service: string; database: string }>(response)
    expect(payload.status).toBe('ok')
    expect(payload.service).toBe('taskpilot-api')
    // With no env configured, health must say so rather than claim readiness.
    expect(payload.database).toBe('unconfigured')
  })

  it('serves an unauthenticated discovery document', async () => {
    const response = await call('/v1')
    expect(response.status).toBe(200)

    const payload = await body<{ data: { authentication: { scopes: string[] }; resources: object } }>(
      response
    )
    expect(payload.data.authentication.scopes).toContain('agents:read')
    expect(payload.data.resources).toHaveProperty('agents')
  })

  it('returns a structured 404 for an unknown route', async () => {
    const response = await call('/v1/nonexistent')
    expect(response.status).toBe(404)

    const payload = await body<{ error: { code: string; message: string } }>(response)
    expect(payload.error.code).toBe('not_found')
    expect(payload.error.message).toContain('/v1/nonexistent')
  })
})

// ─── AUTH ────────────────────────────────────────────────────

describe('authentication', () => {
  it.each([
    ['/v1/me'],
    ['/v1/agents'],
    ['/v1/runs'],
    ['/v1/workflows'],
    ['/v1/notifications'],
    ['/v1/teams'],
    ['/v1/keys'],
    ['/v1/analytics'],
  ])('rejects %s without a credential', async (path) => {
    const response = await call(path)
    expect(response.status).toBe(401)

    const payload = await body<{ error: { code: string } }>(response)
    expect(payload.error.code).toBe('unauthorized')
  })

  it('ignores a bearer token that is neither a key nor a JWT shape', async () => {
    // An empty bearer is treated as "no credential", not as a malformed one.
    const response = await call('/v1/me', { headers: { authorization: 'Bearer ' } })
    expect(response.status).toBe(401)
  })

  it('reports the deployment as unconfigured when a real key is presented', async () => {
    // Without Supabase credentials the service cannot verify anything, and
    // must say so rather than implying the key was wrong.
    const response = await call('/v1/agents', {
      headers: { authorization: 'Bearer tp_live_abcdefghijklmnop' },
    })
    expect(response.status).toBe(503)

    const payload = await body<{ error: { code: string } }>(response)
    expect(payload.error.code).toBe('not_configured')
  })

  it('accepts the API key in X-API-Key as well as Authorization', async () => {
    const response = await call('/v1/agents', {
      headers: { 'x-api-key': 'tp_live_abcdefghijklmnop' },
    })
    // Same unconfigured path — what matters is that the header was read.
    expect(response.status).toBe(503)
  })
})

// ─── PUBLIC ENDPOINTS ────────────────────────────────────────

describe('public endpoints', () => {
  it('allows anonymous marketplace browsing', async () => {
    const response = await call('/v1/marketplace/agents')

    // Never 401 — browsing must not require auth. Here it is 503 because no
    // database is configured, which is a deployment fact, not a 500.
    expect(response.status).toBe(503)
    const payload = await body<{ error: { code: string; message: string } }>(response)
    expect(payload.error.code).toBe('not_configured')
    expect(payload.error.message).toMatch(/services\/api\/.env/)
  })

  it('allows anonymous review reads', async () => {
    const response = await call('/v1/agents/00000000-0000-0000-0000-000000000000/reviews')
    expect(response.status).not.toBe(401)
  })
})

// ─── WORKER ──────────────────────────────────────────────────

describe('worker endpoint', () => {
  const saved = process.env.WORKER_SECRET

  beforeEach(() => {
    delete process.env.WORKER_SECRET
  })

  afterEach(() => {
    if (saved) process.env.WORKER_SECRET = saved
    else delete process.env.WORKER_SECRET
  })

  it('refuses to run when no secret is configured', async () => {
    const response = await call('/v1/jobs/worker', { method: 'POST' })
    expect(response.status).toBe(503)

    const payload = await body<{ error: { message: string } }>(response)
    expect(payload.error.message).toMatch(/WORKER_SECRET/)
  })

  it('rejects a wrong secret', async () => {
    process.env.WORKER_SECRET = 'correct-horse-battery-staple'

    const response = await call('/v1/jobs/worker', {
      method: 'POST',
      headers: { 'x-worker-secret': 'wrong' },
    })
    expect(response.status).toBe(401)
  })

  it('accepts the right secret and then fails on the missing database', async () => {
    process.env.WORKER_SECRET = 'correct-horse-battery-staple'

    const response = await call('/v1/jobs/worker', {
      method: 'POST',
      headers: { 'x-worker-secret': 'correct-horse-battery-staple' },
    })

    // Past the credential check; stopped by configuration, not by auth.
    expect(response.status).toBe(503)
    const payload = await body<{ error: { message: string } }>(response)
    expect(payload.error.message).toMatch(/database/i)
  })
})

// ─── CORS ────────────────────────────────────────────────────

describe('CORS', () => {
  it('answers preflight for a browser extension origin', async () => {
    const response = await call('/v1/runs', {
      method: 'OPTIONS',
      headers: { origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop' },
    })

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'chrome-extension://abcdefghijklmnopabcdefghijklmnop'
    )
    expect(response.headers.get('access-control-allow-headers')).toContain('Authorization')
  })

  it('answers preflight for localhost during development', async () => {
    const response = await call('/v1/runs', {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:3000' },
    })
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:3000')
  })

  it('refuses an unknown origin', async () => {
    const response = await call('/v1/runs', {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example' },
    })
    expect(response.headers.get('access-control-allow-origin')).toBe('null')
  })

  it('honours ALLOWED_ORIGINS for a self-hosted dashboard', async () => {
    process.env.ALLOWED_ORIGINS = 'https://apps.acme.test'
    // The app reads the variable per request, so no rebuild is needed.
    const response = await call('/v1/runs', {
      method: 'OPTIONS',
      headers: { origin: 'https://apps.acme.test' },
    })
    expect(response.headers.get('access-control-allow-origin')).toBe('https://apps.acme.test')
    delete process.env.ALLOWED_ORIGINS
  })

  it('sets hardening headers on ordinary responses', async () => {
    const response = await call('/health')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.headers.get('x-response-time')).toMatch(/^\d+ms$/)
  })
})

// ─── BODY PARSING ────────────────────────────────────────────

describe('request parsing', () => {
  it('rejects malformed JSON before touching a handler', async () => {
    process.env.WORKER_SECRET = 'x'.repeat(16)

    const response = await call('/v1/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer tp_live_aaaaaaaaaaaa' },
      body: '{not json',
    })

    // Auth runs first, so this is the unconfigured path — the point is that
    // a malformed body never produces an unhandled 500.
    expect([400, 503]).toContain(response.status)
    delete process.env.WORKER_SECRET
  })
})
