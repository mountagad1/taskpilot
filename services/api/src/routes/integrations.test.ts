// ============================================================
// TASKPILOT API — INTEGRATION ROUTE TESTS
// services/api/src/routes/integrations.test.ts
//
// Drives the real Hono app against an in-memory stand-in for Supabase and
// a real HTTP server speaking HubSpot's contract. Nothing here is a stub of
// our own code: the guard, the state machine, the token exchange and the
// encryption all execute.
//
// The callback deserves the most attention. It is unauthenticated by
// necessity — the provider redirects a browser to it — so `state` is the
// only thing standing between a user's CRM and anyone who can make them
// load a URL.
// ============================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { createServer, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomBytes } from 'node:crypto'

import { resetRateLimits } from '../lib/security'

// ─── IN-MEMORY SUPABASE ──────────────────────────────────────

type Row = Record<string, any>
const tables: Record<string, Row[]> = { oauth_states: [], integrations: [], profiles: [] }

const USER_ID = '11111111-1111-4111-8111-111111111111'
const SESSION_TOKEN = 'session-token-for-tests'

function matches(row: Row, filters: Array<[string, any]>, isNull: Array<[string, any]>) {
  return (
    filters.every(([k, v]) => row[k] === v) &&
    isNull.every(([k, v]) => (v === null ? row[k] == null : row[k] === v))
  )
}

/** Chainable, thenable query builder covering the calls the routes make. */
function from(table: string) {
  tables[table] ??= []
  const filters: Array<[string, any]> = []
  const nulls: Array<[string, any]> = []

  let mode: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select'
  let payload: Row | null = null
  let conflictKeys: string[] = []
  let returning = false
  let orderBy: string | null = null

  const run = () => {
    const rows = tables[table]

    if (mode === 'insert') {
      payload!.id ??= randomBytes(8).toString('hex')
      rows.push({ ...payload })
      return { data: [payload], error: null }
    }

    if (mode === 'upsert') {
      const existing = rows.find((r) => conflictKeys.every((k) => r[k] === payload![k]))
      if (existing) Object.assign(existing, payload)
      else rows.push({ id: randomBytes(8).toString('hex'), ...payload })
      return { data: [payload], error: null }
    }

    const hit = rows.filter((r) => matches(r, filters, nulls))

    if (mode === 'update') {
      hit.forEach((r) => Object.assign(r, payload))
      return { data: returning ? hit : null, error: null }
    }

    if (mode === 'delete') {
      for (const r of hit) rows.splice(rows.indexOf(r), 1)
      return { data: returning ? hit : null, error: null }
    }

    const sorted = orderBy ? [...hit].sort((a, b) => String(b[orderBy!]).localeCompare(String(a[orderBy!]))) : hit
    return { data: sorted, error: null }
  }

  const builder: any = {
    select(_cols?: string) {
      if (mode === 'select') mode = 'select'
      returning = true
      return builder
    },
    insert(values: Row) {
      mode = 'insert'
      payload = values
      return builder
    },
    update(values: Row) {
      mode = 'update'
      payload = values
      return builder
    },
    upsert(values: Row, options?: { onConflict?: string }) {
      mode = 'upsert'
      payload = values
      conflictKeys = (options?.onConflict ?? '').split(',').map((s) => s.trim()).filter(Boolean)
      return builder
    },
    delete() {
      mode = 'delete'
      return builder
    },
    eq(column: string, value: any) {
      filters.push([column, value])
      return builder
    },
    is(column: string, value: any) {
      nulls.push([column, value])
      return builder
    },
    order(column: string) {
      orderBy = column
      return builder
    },
    maybeSingle() {
      const { data, error } = run()
      return Promise.resolve({ data: Array.isArray(data) ? (data[0] ?? null) : (data ?? null), error })
    },
    single() {
      return builder.maybeSingle()
    },
    then(resolve: (v: any) => void, reject?: (e: any) => void) {
      try {
        resolve(run())
      } catch (e) {
        reject?.(e)
      }
    },
  }
  return builder
}

const fakeAdmin = {
  from,
  auth: {
    getUser: (token: string) =>
      Promise.resolve(
        token === SESSION_TOKEN
          ? { data: { user: { id: USER_ID, email: 'ops@acme.test' } }, error: null }
          : { data: { user: null }, error: { message: 'invalid token' } }
      ),
  },
}

vi.mock('../lib/clients', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/clients')>()
  return {
    ...actual,
    getAdminClient: () => fakeAdmin,
    hasSupabaseCredentials: () => true,
  }
})

// ─── MOCK HUBSPOT ────────────────────────────────────────────

let server: Server
let tokenStatus = 200
let tokenBody: Row = {}

function json(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(payload))
}

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')

    if (url.pathname === '/oauth/v1/token') {
      return json(res, tokenStatus, tokenStatus === 200
        ? { access_token: 'hs-access', refresh_token: 'hs-refresh', expires_in: 1800, ...tokenBody }
        : { message: 'invalid authorization code' })
    }
    if (url.pathname.startsWith('/oauth/v1/access-tokens/')) {
      return json(res, 200, {
        hub_id: 24680135,
        hub_domain: 'acme-staging.hubspot.com',
        user: 'ops@acme.test',
        scopes: ['oauth', 'crm.objects.contacts.read', 'crm.objects.contacts.write'],
      })
    }
    if (url.pathname.startsWith('/crm/v3/objects/contacts/batch/')) {
      return json(res, 201, { results: [{ id: 'contact-1' }] })
    }
    json(res, 404, { message: 'not found' })
  })

  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  process.env.HUBSPOT_API_BASE = base
  process.env.HUBSPOT_APP_BASE = base
  process.env.HUBSPOT_CLIENT_ID = 'test-client-id'
  process.env.HUBSPOT_CLIENT_SECRET = 'test-client-secret'
  process.env.INTEGRATION_ENCRYPTION_KEY = randomBytes(32).toString('hex')
  process.env.PUBLIC_API_URL = 'http://api.test'
  process.env.PUBLIC_APP_URL = 'http://app.test'
})

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()))
})

// Imported after the mock is registered.
const { createApp } = await import('../app')
const app = createApp()

const call = (path: string, init?: RequestInit) =>
  app.request(new Request(`http://api.test${path}`, init))

const authed = (path: string, init: RequestInit = {}) =>
  call(path, {
    ...init,
    headers: { Authorization: `Bearer ${SESSION_TOKEN}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })

const body = async <T = any>(r: Response): Promise<T> => (await r.json()) as T

beforeEach(() => {
  // Rate-limit windows are per-process and last a minute; without this a
  // test that exhausts a limit would fail every test after it.
  resetRateLimits()
  tables.oauth_states = []
  tables.integrations = []
  tables.profiles = [{ id: USER_ID, email: 'ops@acme.test', plan: 'pro' }]
  tokenStatus = 200
  tokenBody = {}
})

/** Runs the authorize step and returns the state it minted. */
async function startFlow(): Promise<string> {
  const response = await authed('/v1/integrations/hubspot/authorize', {
    method: 'POST',
    body: JSON.stringify({}),
  })
  expect(response.status).toBe(200)
  return (await body(response)).data.state
}

// ─── STATUS ──────────────────────────────────────────────────

describe('GET /v1/integrations/status', () => {
  it('reports readiness without authentication', async () => {
    const payload = await body(await call('/v1/integrations/status'))
    expect(payload.data.providers).toContain('hubspot')
    expect(payload.data.hubspot.credentials).toBe(true)
    expect(payload.data.hubspot.encryption_key).toBe(true)
  })

  it('publishes the exact redirect URI to register with HubSpot', async () => {
    const payload = await body(await call('/v1/integrations/status'))
    expect(payload.data.hubspot.redirect_uri).toBe('http://api.test/v1/integrations/hubspot/callback')
  })
})

// ─── AUTHORIZE ───────────────────────────────────────────────

describe('POST /v1/integrations/:provider/authorize', () => {
  it('requires authentication', async () => {
    const response = await call('/v1/integrations/hubspot/authorize', { method: 'POST' })
    expect(response.status).toBe(401)
  })

  it('returns a consent URL and records the state', async () => {
    const payload = await body(await authed('/v1/integrations/hubspot/authorize', { method: 'POST', body: '{}' }))
    const url = new URL(payload.data.authorize_url)

    expect(url.pathname).toBe('/oauth/authorize')
    expect(url.searchParams.get('state')).toBe(payload.data.state)
    expect(tables.oauth_states).toHaveLength(1)
    expect(tables.oauth_states[0].user_id).toBe(USER_ID)
  })

  it('mints an unpredictable state each time', async () => {
    const states = new Set<string>()
    for (let i = 0; i < 15; i++) states.add(await startFlow())
    expect(states.size).toBe(15)
    for (const s of states) expect(s.length).toBeGreaterThanOrEqual(40)
  })

  it('rejects a provider that is not implemented', async () => {
    const response = await authed('/v1/integrations/salesforce/authorize', { method: 'POST', body: '{}' })
    expect(response.status).toBe(400)
    expect((await body(response)).error.message).toMatch(/not available yet/)
  })

  it('refuses to start a flow when no encryption key is set', async () => {
    // Starting a flow whose result cannot be stored safely would end with a
    // live credential and nowhere to put it.
    const saved = process.env.INTEGRATION_ENCRYPTION_KEY
    delete process.env.INTEGRATION_ENCRYPTION_KEY
    const response = await authed('/v1/integrations/hubspot/authorize', { method: 'POST', body: '{}' })
    expect(response.status).toBe(503)
    expect((await body(response)).error.message).toMatch(/INTEGRATION_ENCRYPTION_KEY/)
    process.env.INTEGRATION_ENCRYPTION_KEY = saved
  })

  it('refuses to start a flow with no HubSpot credentials', async () => {
    const saved = process.env.HUBSPOT_CLIENT_SECRET
    delete process.env.HUBSPOT_CLIENT_SECRET
    const response = await authed('/v1/integrations/hubspot/authorize', { method: 'POST', body: '{}' })
    expect(response.status).toBe(503)
    process.env.HUBSPOT_CLIENT_SECRET = saved
  })

  it('ignores a return_to pointing at another origin', async () => {
    // Reflecting this would turn the callback into an open redirect.
    await authed('/v1/integrations/hubspot/authorize', {
      method: 'POST',
      body: JSON.stringify({ return_to: 'https://evil.example/steal' }),
    })
    expect(tables.oauth_states[0].return_to).toBeNull()
  })

  it('keeps a return_to on the dashboard origin', async () => {
    await authed('/v1/integrations/hubspot/authorize', {
      method: 'POST',
      body: JSON.stringify({ return_to: 'http://app.test/dashboard/agents' }),
    })
    expect(tables.oauth_states[0].return_to).toBe('http://app.test/dashboard/agents')
  })
})

// ─── CALLBACK ────────────────────────────────────────────────

describe('GET /v1/integrations/:provider/callback', () => {
  it('completes the exchange and stores an encrypted connection', async () => {
    const state = await startFlow()
    const response = await call(`/v1/integrations/hubspot/callback?code=good-code&state=${state}`)

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toContain('connected=hubspot')

    const row = tables.integrations[0]
    expect(row.user_id).toBe(USER_ID)
    expect(row.workspace_id).toBe('24680135')
    expect(row.scopes).toContain('crm.objects.contacts.write')
    expect(row.token_encrypted).toBe(true)
  })

  it('never stores a token in plaintext', async () => {
    const state = await startFlow()
    await call(`/v1/integrations/hubspot/callback?code=good-code&state=${state}`)

    const row = tables.integrations[0]
    expect(row.access_token).not.toContain('hs-access')
    expect(row.refresh_token).not.toContain('hs-refresh')
    expect(row.access_token.startsWith('v1:')).toBe(true)
    // Whole-row scan: no field may carry the raw credential.
    expect(JSON.stringify(row)).not.toContain('hs-refresh')
  })

  it('rejects a state that was never issued', async () => {
    const response = await call('/v1/integrations/hubspot/callback?code=c&state=fabricated')
    expect(response.headers.get('location')).toContain('error=')
    expect(decodeURIComponent(response.headers.get('location')!)).toMatch(/not recognised/)
    expect(tables.integrations).toHaveLength(0)
  })

  it('refuses to replay a state that was already consumed', async () => {
    const state = await startFlow()
    await call(`/v1/integrations/hubspot/callback?code=good-code&state=${state}`)

    tables.integrations = [] // prove the second attempt writes nothing
    const replay = await call(`/v1/integrations/hubspot/callback?code=good-code&state=${state}`)

    expect(decodeURIComponent(replay.headers.get('location')!)).toMatch(/already been used/)
    expect(tables.integrations).toHaveLength(0)
  })

  it('rejects an expired state', async () => {
    const state = await startFlow()
    tables.oauth_states[0].expires_at = new Date(Date.now() - 1000).toISOString()

    const response = await call(`/v1/integrations/hubspot/callback?code=good-code&state=${state}`)
    expect(decodeURIComponent(response.headers.get('location')!)).toMatch(/expired/)
    expect(tables.integrations).toHaveLength(0)
  })

  it('rejects a state issued for a different provider', async () => {
    const state = await startFlow()
    tables.oauth_states[0].provider = 'salesforce'

    const response = await call(`/v1/integrations/hubspot/callback?code=good-code&state=${state}`)
    expect(decodeURIComponent(response.headers.get('location')!)).toMatch(/different provider/)
  })

  it('reports a user who declined consent without treating it as our failure', async () => {
    const response = await call(
      '/v1/integrations/hubspot/callback?error=access_denied&error_description=User+declined'
    )
    expect(response.status).toBe(302)
    expect(decodeURIComponent(response.headers.get('location')!)).toContain('User declined')
  })

  it('handles a callback missing its code', async () => {
    const state = await startFlow()
    const response = await call(`/v1/integrations/hubspot/callback?state=${state}`)
    expect(decodeURIComponent(response.headers.get('location')!)).toMatch(/missing its state or code/)
  })

  it('consumes the state even when the exchange fails, so it cannot be retried', async () => {
    const state = await startFlow()
    tokenStatus = 400

    const response = await call(`/v1/integrations/hubspot/callback?code=stale&state=${state}`)
    expect(decodeURIComponent(response.headers.get('location')!)).toMatch(/invalid authorization code/)
    expect(tables.oauth_states[0].consumed_at).toBeTruthy()
    expect(tables.integrations).toHaveLength(0)
  })

  it('returns the user to a permitted return_to', async () => {
    await authed('/v1/integrations/hubspot/authorize', {
      method: 'POST',
      body: JSON.stringify({ return_to: 'http://app.test/dashboard/workflows' }),
    })
    const state = tables.oauth_states[0].state

    const response = await call(`/v1/integrations/hubspot/callback?code=good-code&state=${state}`)
    expect(response.headers.get('location')).toBe('http://app.test/dashboard/workflows?connected=hubspot')
  })

  it('reconnecting replaces the existing grant rather than duplicating it', async () => {
    for (let i = 0; i < 2; i++) {
      const state = await startFlow()
      await call(`/v1/integrations/hubspot/callback?code=good-code&state=${state}`)
    }
    expect(tables.integrations).toHaveLength(1)
  })
})

// ─── LIST ────────────────────────────────────────────────────

describe('GET /v1/integrations', () => {
  it('lists connections without exposing tokens', async () => {
    const state = await startFlow()
    await call(`/v1/integrations/hubspot/callback?code=good-code&state=${state}`)

    const response = await authed('/v1/integrations')
    const raw = await response.text()

    expect(raw).not.toContain('hs-access')
    expect(raw).not.toContain('access_token')
    expect(raw).not.toContain('refresh_token')

    const payload = JSON.parse(raw)
    expect(payload.data[0].provider).toBe('hubspot')
    expect(payload.data[0].workspace_name).toBe('acme-staging.hubspot.com')
    expect(payload.data[0].needs_reconnect).toBe(false)
  })

  it('flags a connection whose refresh has failed', async () => {
    const state = await startFlow()
    await call(`/v1/integrations/hubspot/callback?code=good-code&state=${state}`)
    tables.integrations[0].refresh_error = 'refresh token is invalid'

    const payload = await body(await authed('/v1/integrations'))
    expect(payload.data[0].needs_reconnect).toBe(true)
  })

  it('returns an empty list, not an error, when nothing is connected', async () => {
    const payload = await body(await authed('/v1/integrations'))
    expect(payload.data).toEqual([])
  })
})

// ─── PUSH ────────────────────────────────────────────────────

describe('POST /v1/integrations/:provider/push', () => {
  async function connect() {
    const state = await startFlow()
    await call(`/v1/integrations/hubspot/callback?code=good-code&state=${state}`)
  }

  it('pushes records through the stored connection', async () => {
    await connect()
    const payload = await body(
      await authed('/v1/integrations/hubspot/push', {
        method: 'POST',
        body: JSON.stringify({ records: [{ email: 'ada@example.com' }] }),
      })
    )
    expect(payload.data.created).toBe(1)
    expect(payload.data.ids).toEqual(['contact-1'])
  })

  it('tells the caller to connect first when there is no integration', async () => {
    const response = await authed('/v1/integrations/hubspot/push', {
      method: 'POST',
      body: JSON.stringify({ records: [{ email: 'a@b.test' }] }),
    })
    expect(response.status).toBe(400)
    expect((await body(response)).error.message).toMatch(/Connect it at Dashboard/)
  })

  it('rejects an empty record list', async () => {
    await connect()
    const response = await authed('/v1/integrations/hubspot/push', {
      method: 'POST',
      body: JSON.stringify({ records: [] }),
    })
    expect(response.status).toBe(400)
  })

  it('refuses a push when only read scope was granted', async () => {
    await connect()
    tables.integrations[0].scopes = ['oauth', 'crm.objects.contacts.read']

    const response = await authed('/v1/integrations/hubspot/push', {
      method: 'POST',
      body: JSON.stringify({ records: [{ email: 'a@b.test' }] }),
    })
    expect(response.status).toBe(403)
    expect((await body(response)).error.message).toMatch(/read-only/)
  })

  it('refreshes an access token that is about to expire', async () => {
    await connect()
    const before = tables.integrations[0].access_token
    // Inside the refresh margin, so the next use must rotate it.
    tables.integrations[0].expires_at = new Date(Date.now() + 60_000).toISOString()

    const response = await authed('/v1/integrations/hubspot/push', {
      method: 'POST',
      body: JSON.stringify({ records: [{ email: 'a@b.test' }] }),
    })

    expect(response.status).toBe(200)
    expect(tables.integrations[0].access_token).not.toBe(before)
    expect(tables.integrations[0].last_refreshed_at).toBeTruthy()
  })

  it('records why a refresh failed and asks for a reconnect', async () => {
    await connect()
    tables.integrations[0].expires_at = new Date(Date.now() - 1000).toISOString()
    tokenStatus = 400

    const response = await authed('/v1/integrations/hubspot/push', {
      method: 'POST',
      body: JSON.stringify({ records: [{ email: 'a@b.test' }] }),
    })

    expect(response.status).toBe(401)
    expect((await body(response)).error.message).toMatch(/must be reconnected/)
    expect(tables.integrations[0].refresh_error).toBeTruthy()
  })

  it('marks the connection as used', async () => {
    await connect()
    await authed('/v1/integrations/hubspot/push', {
      method: 'POST',
      body: JSON.stringify({ records: [{ email: 'a@b.test' }] }),
    })
    expect(tables.integrations[0].last_used_at).toBeTruthy()
  })
})

// ─── DISCONNECT ──────────────────────────────────────────────

describe('DELETE /v1/integrations/:provider', () => {
  it('removes the stored grant', async () => {
    const state = await startFlow()
    await call(`/v1/integrations/hubspot/callback?code=good-code&state=${state}`)

    const response = await authed('/v1/integrations/hubspot', { method: 'DELETE' })
    expect(response.status).toBe(200)
    expect(tables.integrations).toHaveLength(0)
  })

  it('404s when there is nothing to disconnect', async () => {
    const response = await authed('/v1/integrations/hubspot', { method: 'DELETE' })
    expect(response.status).toBe(404)
  })

  it('requires authentication', async () => {
    const response = await call('/v1/integrations/hubspot', { method: 'DELETE' })
    expect(response.status).toBe(401)
  })
})

// ─── REDIRECT SAFETY AND CALLBACK CONTRACT ───────────────────

describe('return_to cannot be used as an open redirect', () => {
  const start = async (returnTo: string) => {
    await authed('/v1/integrations/hubspot/authorize', {
      method: 'POST',
      body: JSON.stringify({ return_to: returnTo }),
    })
    return tables.oauth_states[tables.oauth_states.length - 1]
  }

  // Built from a char code so no layer between here and the assertion can
  // quietly eat the backslash — which is exactly how this bug hides.
  const BACKSLASH = String.fromCharCode(92)

  it('rejects a backslash-prefixed path that resolves off-origin', async () => {
    // "/\evil.example/steal" begins with a single slash, so a naive
    // startsWith('//') check passes it — but URL parsing treats the
    // backslash as a slash, and the origin becomes evil.example.
    const candidate = '/' + BACKSLASH + 'evil.example/steal'
    expect(new URL(candidate, 'http://app.test/').origin).toBe('http://evil.example')

    expect((await start(candidate)).return_to).toBeNull()
  })

  it('rejects a leading double backslash', async () => {
    const candidate = BACKSLASH + BACKSLASH + 'evil.example/steal'
    expect((await start(candidate)).return_to).toBeNull()
  })

  it('rejects a protocol-relative URL', async () => {
    expect((await start('//evil.example/steal')).return_to).toBeNull()
  })

  it('rejects a javascript: payload', async () => {
    expect((await start('javascript:alert(1)')).return_to).toBeNull()
  })

  it('resolves a plain relative path against the dashboard origin', async () => {
    // Emitted from the API origin, a bare path would land on the API rather
    // than the dashboard.
    expect((await start('/dashboard/agents')).return_to).toBe('http://app.test/dashboard/agents')
  })

  it('allows loopback outside production', async () => {
    // A convenience for local development, where the dashboard genuinely
    // runs on a port that is not PUBLIC_APP_URL.
    expect((await start('http://localhost:9999/x')).return_to).toBe('http://localhost:9999/x')
  })

  it('rejects loopback in production', async () => {
    // In production this is a redirect to an arbitrary port on the victim's
    // own machine, where something is usually listening.
    const saved = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      expect((await start('http://localhost:9999/x')).return_to).toBeNull()
    } finally {
      process.env.NODE_ENV = saved
    }
  })
})

describe('callback always redirects', () => {
  it('redirects rather than returning JSON for an unimplemented provider', async () => {
    // The route contract is that a person in a browser always lands
    // somewhere. Validating the provider by throwing would render JSON.
    const response = await call('/v1/integrations/salesforce/callback?code=x&state=y')
    expect(response.status).toBe(302)
    expect(decodeURIComponent(response.headers.get('location')!)).toMatch(/not an available integration/)
  })
})

describe('authorize scope handling', () => {
  it('treats an empty scopes array as "use the defaults"', async () => {
    // An empty array is a caller that built the field and left it blank,
    // not a request to grant nothing.
    const payload = await body(
      await authed('/v1/integrations/hubspot/authorize', {
        method: 'POST',
        body: JSON.stringify({ scopes: [] }),
      })
    )
    const scope = new URL(payload.data.authorize_url).searchParams.get('scope')
    expect(scope).toBeTruthy()
    expect(scope).toContain('crm.objects.contacts.write')
  })
})
