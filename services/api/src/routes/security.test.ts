// ============================================================
// TASKPILOT API — SCOPES, CLIENT IP AND PER-ACCOUNT LIMITS
// services/api/src/routes/security.test.ts
//
// 1. Every route a machine key can reach demands a scope, and the
//    money/credential routes refuse keys outright. A key that was granted
//    only `marketplace:read` must not be able to change team members, spend
//    AI quota or start a purchase.
// 2. The client IP used for anonymous rate limits comes from the proxy end
//    of X-Forwarded-For, so a client cannot pick a fresh one per request.
// 3. Login is limited per account, whatever IP the attempts come from.
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'

type Row = Record<string, any>

const USER_ID = '00000000-0000-0000-0000-0000000000cc'
const SESSION_TOKEN = 'session-token-for-scope-tests'
const NARROW_KEY = 'tp_live_scopetestnarrowkey0000000000000000000'
const WIDE_KEY = 'tp_live_scopetestwidekey00000000000000000000000'

const { hashApiKey } = await import('../lib/keys')
const { API_SCOPES } = await import('@taskpilot/shared')

const keys: Row[] = [
  { id: 'key_narrow', user_id: USER_ID, key_hash: await hashApiKey(NARROW_KEY), scopes: ['marketplace:read'], expires_at: null, revoked_at: null },
  { id: 'key_wide', user_id: USER_ID, key_hash: await hashApiKey(WIDE_KEY), scopes: [...API_SCOPES], expires_at: null, revoked_at: null },
]

/** Just enough of the admin client for caller resolution; handlers never run in the 403 cases. */
function from(table: string) {
  const filters: Array<[string, unknown]> = []
  const rows = () => {
    const source = table === 'api_keys' ? keys : table === 'profiles' ? [{ id: USER_ID, email: 'dev@acme.test', plan: 'pro' }] : []
    return source.filter((r) => filters.every(([k, v]) => r[k] === v))
  }
  const builder: any = {
    select: () => builder,
    update: () => builder,
    insert: () => builder,
    order: () => builder,
    range: () => builder,
    limit: () => builder,
    in: () => builder,
    is: () => builder,
    eq: (k: string, v: unknown) => {
      filters.push([k, v])
      return builder
    },
    maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
    single: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => void) => resolve({ data: rows(), error: null, count: rows().length }),
  }
  return builder
}

const signInWithPassword = vi.fn(async () => ({ data: { session: null, user: null }, error: { message: 'Invalid login credentials' } }))

vi.mock('../lib/clients', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/clients')>()
  return {
    ...actual,
    getAdminClient: () => ({
      from,
      rpc: () => Promise.resolve({ data: null, error: null }),
      auth: {
        getUser: (token: string) =>
          Promise.resolve(
            token === SESSION_TOKEN
              ? { data: { user: { id: USER_ID, email: 'dev@acme.test' } }, error: null }
              : { data: { user: null }, error: { message: 'invalid' } }
          ),
        admin: { signOut: async () => ({ error: null }) },
      },
    }),
    createAuthClient: () => ({ auth: { signInWithPassword } }),
    hasSupabaseCredentials: () => true,
    hasStripeCredentials: () => true,
  }
})

const { createApp } = await import('../app')
const { pickClientIp } = await import('../middleware/kernel')
const app = createApp()

/** A 403 from the handler itself (e.g. "not a member of this team") is fine; a guard refusal is not. */
async function passedGuard(response: Response): Promise<boolean> {
  if (response.status === 401) return false
  if (response.status !== 403) return true
  const message: string = (await response.json()).error?.message ?? ''
  return !/required scope|cannot be called with an API key/.test(message)
}

const request = (method: string, path: string, token: string, headers: Record<string, string> = {}) =>
  app.request(
    new Request(`http://api.test${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers },
      body: method === 'GET' ? undefined : '{}',
    })
  )

// ─── 1. SCOPES ───────────────────────────────────────────────

/** [method, path, scope the key needs] — routes that used to accept ANY key. */
const SCOPED: Array<[string, string, string]> = [
  ['GET', '/v1/teams', 'teams:read'],
  ['POST', '/v1/teams', 'teams:write'],
  ['GET', '/v1/teams/t1/members', 'teams:read'],
  ['PATCH', '/v1/teams/t1/members', 'teams:write'],
  ['DELETE', '/v1/teams/t1/members', 'teams:write'],
  ['GET', '/v1/teams/t1/invites', 'teams:read'],
  ['POST', '/v1/teams/t1/invites', 'teams:write'],
  ['POST', '/v1/teams/invites/accept', 'teams:write'],
  ['GET', '/v1/notifications', 'notifications:read'],
  ['POST', '/v1/notifications/read', 'notifications:write'],
  ['GET', '/v1/integrations', 'integrations:read'],
  ['POST', '/v1/ai/process', 'runs:write'],
  ['POST', '/v1/ai/smart-paste', 'runs:write'],
]

/** Routes no API key may call, whatever its scopes. */
const SESSION_ONLY: Array<[string, string]> = [
  ['POST', '/v1/billing/checkout'],
  ['POST', '/v1/auth/logout'],
  ['POST', '/v1/auth/update-password'],
]

describe('API key scopes', () => {
  it.each(SCOPED)('%s %s refuses a key without %s', async (method, path, scope) => {
    const response = await request(method, path, NARROW_KEY)
    expect(response.status).toBe(403)
    expect((await response.json()).error.message).toContain(scope)
  })

  it.each(SCOPED)('%s %s lets a key with the scope past the guard', async (method, path) => {
    expect(await passedGuard(await request(method, path, WIDE_KEY))).toBe(true)
  })

  it.each(SESSION_ONLY)('%s %s refuses even a key holding every scope', async (method, path) => {
    const response = await request(method, path, WIDE_KEY)
    expect(response.status).toBe(403)
    expect((await response.json()).error.message).toContain('cannot be called with an API key')
  })

  it.each(SCOPED)('%s %s still works for a signed-in user', async (method, path) => {
    expect(await passedGuard(await request(method, path, SESSION_TOKEN))).toBe(true)
  })

  it('offers every new scope when creating a key', () => {
    for (const [, , scope] of SCOPED) expect(API_SCOPES).toContain(scope)
  })
})

// ─── 2. CLIENT IP ────────────────────────────────────────────

describe('pickClientIp', () => {
  it('takes the entry the trusted proxy appended, not what the client sent', () => {
    // Railway appends the real peer to whatever the client supplied.
    expect(pickClientIp('6.6.6.6, 203.0.113.9', undefined, 1)).toBe('203.0.113.9')
    expect(pickClientIp('1.1.1.1, 2.2.2.2, 203.0.113.9', undefined, 1)).toBe('203.0.113.9')
  })

  it('reads the Railway "<client>, <edge>" header correctly with the default', async () => {
    const { DEFAULT_PROXY_HOPS } = await import('../middleware/kernel')
    expect(DEFAULT_PROXY_HOPS).toBe(2)
    // Shape captured from production: client first, a per-request edge address last.
    expect(pickClientIp('160.191.77.117, 152.233.33.163', '160.191.77.117', DEFAULT_PROXY_HOPS)).toBe('160.191.77.117')
    expect(pickClientIp('160.191.77.117, 152.233.68.98', '160.191.77.117', DEFAULT_PROXY_HOPS)).toBe('160.191.77.117')
  })

  it('skips one more hop behind the Vercel rewrite', () => {
    // Vercel replaces the header with the visitor, Railway appends Vercel's address.
    expect(pickClientIp('198.51.100.7, 76.76.21.1', undefined, 2)).toBe('198.51.100.7')
  })

  it('falls back to X-Real-IP, then "unknown"', () => {
    expect(pickClientIp(undefined, '203.0.113.5', 1)).toBe('203.0.113.5')
    expect(pickClientIp('', undefined, 1)).toBe('unknown')
  })

  it('never reads a client-supplied cf-connecting-ip', async () => {
    const seen = async (fake: string) =>
      (await (
        await app.request(
          new Request('http://api.test/v1/ip', {
            // As Railway delivers it: "<client>, <edge>", plus a forged Cloudflare header.
            headers: { 'cf-connecting-ip': fake, 'x-forwarded-for': '203.0.113.9, 152.233.33.163' },
          })
        )
      ).json()).data.ip
    expect(await seen('6.6.6.6')).toBe('203.0.113.9')
    expect(await seen('7.7.7.7')).toBe('203.0.113.9')
  })
})

// ─── 3. PER-ACCOUNT LOGIN LIMIT ──────────────────────────────

describe('login is limited per account', () => {
  beforeEach(() => signInWithPassword.mockClear())

  const attempt = (email: string, ip: string) =>
    app.request(
      new Request('http://api.test/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
        body: JSON.stringify({ email, password: 'wrong-password-123' }),
      })
    )

  it('blocks the 6th attempt on one email even from a new IP each time', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 6; i++) statuses.push((await attempt('victim@acme.test', `10.0.0.${i + 1}`)).status)

    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401])
    expect(statuses[5]).toBe(429)
    // The blocked attempt never reached Supabase.
    expect(signInWithPassword).toHaveBeenCalledTimes(5)
  })

  it('treats the email case-insensitively and leaves other accounts alone', async () => {
    expect((await attempt('VICTIM@acme.test', '10.0.1.1')).status).toBe(429)
    expect((await attempt('someone-else@acme.test', '10.0.1.2')).status).toBe(401)
  })
})
