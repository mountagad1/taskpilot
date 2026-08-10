// ============================================================
// TASKPILOT API — HUBSPOT PROVIDER TESTS
// services/api/src/lib/oauth/hubspot.test.ts
//
// These run against a real HTTP server implementing HubSpot's contract,
// not a stubbed `fetch`. That way the request encoding is actually
// verified — the token endpoint takes form-encoded bodies, and sending
// JSON is the single easiest way to get this wrong.
// ============================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

import {
  buildAuthorizeUrl,
  exchangeCode,
  refreshTokens,
  identify,
  pushContacts,
  hasHubSpotCredentials,
  hubspotCredentials,
  HUBSPOT_DEFAULT_SCOPES,
} from './hubspot'

// ─── MOCK HUBSPOT ────────────────────────────────────────────

interface Recorded {
  path: string
  contentType: string
  body: string
  auth: string | undefined
}

let server: Server
let baseUrl: string
let received: Recorded[] = []

/** Per-test overrides so a case can force an error shape. */
let tokenHandler: ((params: URLSearchParams, res: ServerResponse) => void) | null = null
let batchHandler: ((body: any, res: ServerResponse) => void) | null = null

function json(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(payload))
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const raw = await readBody(req)

    received.push({
      path: url.pathname,
      contentType: req.headers['content-type'] ?? '',
      body: raw,
      auth: req.headers.authorization,
    })

    // ── token endpoint ──
    if (url.pathname === '/oauth/v1/token' && req.method === 'POST') {
      const params = new URLSearchParams(raw)
      if (tokenHandler) return tokenHandler(params, res)

      if (!params.get('client_id') || !params.get('client_secret')) {
        return json(res, 400, { status: 'BAD_AUTH_CODE', message: 'missing credentials' })
      }
      if (params.get('grant_type') === 'authorization_code' && params.get('code') !== 'good-code') {
        return json(res, 400, { status: 'BAD_AUTH_CODE', message: 'invalid authorization code' })
      }
      return json(res, 200, {
        access_token: 'access-' + (params.get('grant_type') === 'refresh_token' ? 'refreshed' : 'initial'),
        refresh_token: 'refresh-token-value',
        expires_in: 1800,
      })
    }

    // ── token info ──
    if (url.pathname.startsWith('/oauth/v1/access-tokens/')) {
      const token = decodeURIComponent(url.pathname.split('/').pop() ?? '')
      if (token === 'bad-token') return json(res, 404, { message: 'not found' })
      return json(res, 200, {
        hub_id: 24680135,
        hub_domain: 'acme-staging.hubspot.com',
        user: 'ops@acme.test',
        scopes: ['oauth', 'crm.objects.contacts.read', 'crm.objects.contacts.write'],
      })
    }

    // ── batch contact create ──
    if (
      url.pathname === '/crm/v3/objects/contacts/batch/create' ||
      url.pathname === '/crm/v3/objects/contacts/batch/upsert'
    ) {
      const parsed = JSON.parse(raw || '{}')
      if (batchHandler) return batchHandler(parsed, res)
      return json(res, 201, {
        results: parsed.inputs.map((_: unknown, i: number) => ({ id: `contact-${i + 1}` })),
      })
    }

    json(res, 404, { message: 'no such endpoint' })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  process.env.HUBSPOT_API_BASE = baseUrl
  process.env.HUBSPOT_APP_BASE = baseUrl
  process.env.HUBSPOT_CLIENT_ID = 'test-client-id'
  process.env.HUBSPOT_CLIENT_SECRET = 'test-client-secret'
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  delete process.env.HUBSPOT_API_BASE
  delete process.env.HUBSPOT_APP_BASE
  delete process.env.HUBSPOT_CLIENT_ID
  delete process.env.HUBSPOT_CLIENT_SECRET
})

beforeEach(() => {
  received = []
  tokenHandler = null
  batchHandler = null
})

const last = () => received[received.length - 1]

// ─── AUTHORIZE URL ───────────────────────────────────────────

describe('buildAuthorizeUrl', () => {
  it('includes every parameter HubSpot requires', () => {
    const url = new URL(
      buildAuthorizeUrl({ redirectUri: 'https://api.test/v1/integrations/hubspot/callback', state: 'st-1' })
    )
    expect(url.pathname).toBe('/oauth/authorize')
    expect(url.searchParams.get('client_id')).toBe('test-client-id')
    expect(url.searchParams.get('redirect_uri')).toBe('https://api.test/v1/integrations/hubspot/callback')
    expect(url.searchParams.get('state')).toBe('st-1')
    expect(url.searchParams.get('scope')).toBe(HUBSPOT_DEFAULT_SCOPES.join(' '))
  })

  it('never puts the client secret in the redirect', () => {
    // The authorize URL is visible in the address bar and in referrer logs.
    const url = buildAuthorizeUrl({ redirectUri: 'https://api.test/cb', state: 's' })
    expect(url).not.toContain('test-client-secret')
    expect(url).not.toContain('client_secret')
  })

  it('encodes the scope separator as %20, not +', () => {
    // HubSpot treats a literal '+' as part of the scope name and rejects it.
    const url = buildAuthorizeUrl({ redirectUri: 'https://api.test/cb', state: 's' })
    expect(url).toContain('scope=oauth%20crm.objects.contacts.read')
    expect(url).not.toMatch(/scope=[^&]*\+/)
  })

  it('accepts a caller-supplied scope list', () => {
    const url = new URL(
      buildAuthorizeUrl({ redirectUri: 'https://api.test/cb', state: 's', scopes: ['oauth', 'tickets'] })
    )
    expect(url.searchParams.get('scope')).toBe('oauth tickets')
  })

  it('reports missing credentials as not_configured, naming both variables', () => {
    const savedId = process.env.HUBSPOT_CLIENT_ID
    delete process.env.HUBSPOT_CLIENT_ID
    expect(hasHubSpotCredentials()).toBe(false)
    expect(() => hubspotCredentials()).toThrow(/HUBSPOT_CLIENT_ID/)
    expect(() => hubspotCredentials()).toThrow(/HUBSPOT_CLIENT_SECRET/)
    process.env.HUBSPOT_CLIENT_ID = savedId
  })
})

// ─── TOKEN EXCHANGE ──────────────────────────────────────────

describe('exchangeCode', () => {
  it('exchanges an authorization code for a token set', async () => {
    const tokens = await exchangeCode({ code: 'good-code', redirectUri: 'https://api.test/cb' })

    expect(tokens.accessToken).toBe('access-initial')
    expect(tokens.refreshToken).toBe('refresh-token-value')
    expect(tokens.expiresAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('sends form-encoded parameters, not JSON', async () => {
    await exchangeCode({ code: 'good-code', redirectUri: 'https://api.test/cb' })

    expect(last().contentType).toContain('application/x-www-form-urlencoded')
    expect(() => JSON.parse(last().body)).toThrow()

    const params = new URLSearchParams(last().body)
    expect(params.get('grant_type')).toBe('authorization_code')
    expect(params.get('client_secret')).toBe('test-client-secret')
    expect(params.get('redirect_uri')).toBe('https://api.test/cb')
  })

  it('converts expires_in into an absolute instant', async () => {
    const before = Date.now()
    const tokens = await exchangeCode({ code: 'good-code', redirectUri: 'https://api.test/cb' })
    // 1800s from now, allowing for test execution time.
    expect(tokens.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 1_790_000)
    expect(tokens.expiresAt.getTime()).toBeLessThan(before + 1_810_000)
  })

  it("surfaces HubSpot's own message when the code is rejected", async () => {
    await expect(exchangeCode({ code: 'stale-code', redirectUri: 'https://api.test/cb' })).rejects.toThrow(
      /invalid authorization code/
    )
  })

  it('reports a non-JSON upstream response as upstream_error', async () => {
    tokenHandler = (_p, res) => {
      res.writeHead(502, { 'Content-Type': 'text/html' })
      res.end('<html>gateway</html>')
    }
    await expect(exchangeCode({ code: 'good-code', redirectUri: 'https://api.test/cb' })).rejects.toThrow(
      /non-JSON token response/
    )
  })

  it('rejects a 200 response that carries no tokens', async () => {
    tokenHandler = (_p, res) => json(res, 200, { expires_in: 1800 })
    await expect(exchangeCode({ code: 'good-code', redirectUri: 'https://api.test/cb' })).rejects.toThrow(
      /no tokens/
    )
  })
})

// ─── REFRESH ─────────────────────────────────────────────────

describe('refreshTokens', () => {
  it('exchanges a refresh token for a new access token', async () => {
    const tokens = await refreshTokens('refresh-token-value')
    expect(tokens.accessToken).toBe('access-refreshed')

    const params = new URLSearchParams(last().body)
    expect(params.get('grant_type')).toBe('refresh_token')
    expect(params.get('refresh_token')).toBe('refresh-token-value')
  })

  it('propagates a revoked grant as an error', async () => {
    tokenHandler = (_p, res) => json(res, 400, { message: 'refresh token is invalid' })
    await expect(refreshTokens('dead-token')).rejects.toThrow(/refresh token is invalid/)
  })
})

// ─── IDENTIFY ────────────────────────────────────────────────

describe('identify', () => {
  it('returns the portal and the scopes actually granted', async () => {
    const identity = await identify('access-initial')
    expect(identity.hubId).toBe('24680135')
    expect(identity.hubDomain).toBe('acme-staging.hubspot.com')
    expect(identity.scopes).toContain('crm.objects.contacts.write')
  })

  it('url-encodes the token in the path', async () => {
    await identify('token/with/slashes')
    expect(last().path).toBe('/oauth/v1/access-tokens/token%2Fwith%2Fslashes')
  })

  it('fails clearly for an unknown token', async () => {
    await expect(identify('bad-token')).rejects.toThrow(/could not identify/)
  })
})

// ─── PUSH ────────────────────────────────────────────────────

describe('pushContacts', () => {
  it('creates contacts and returns their ids', async () => {
    const result = await pushContacts('access-initial', [
      { email: 'ada@example.com', firstname: 'Ada' },
      { email: 'grace@example.com', firstname: 'Grace' },
    ])

    expect(result.created).toBe(2)
    expect(result.ids).toEqual(['contact-1', 'contact-2'])
    expect(result.failed).toHaveLength(0)
  })

  it('sends a bearer token and JSON', async () => {
    await pushContacts('access-initial', [{ email: 'a@b.test' }])
    expect(last().auth).toBe('Bearer access-initial')
    expect(last().contentType).toContain('application/json')
  })

  it('maps records into HubSpot property objects', async () => {
    await pushContacts('access-initial', [
      { email: 'ada@example.com', firstname: 'Ada', company: 'Analytical Engines' },
    ])
    const body = JSON.parse(last().body)
    expect(body.inputs[0].properties).toEqual({
      email: 'ada@example.com',
      firstname: 'Ada',
      company: 'Analytical Engines',
    })
  })

  it('drops empty and null values rather than sending them', async () => {
    // HubSpot rejects a property set to null, and blanking a real value on
    // an existing contact would be destructive.
    await pushContacts('access-initial', [
      { email: 'ada@example.com', firstname: '', phone: undefined, company: null as unknown as string },
    ])
    expect(JSON.parse(last().body).inputs[0].properties).toEqual({ email: 'ada@example.com' })
  })

  it('passes through custom properties', async () => {
    await pushContacts('access-initial', [{ email: 'a@b.test', lead_source: 'TaskPilot' }])
    expect(JSON.parse(last().body).inputs[0].properties.lead_source).toBe('TaskPilot')
  })

  it('splits into batches of 100', async () => {
    const records = Array.from({ length: 250 }, (_, i) => ({ email: `user${i}@example.com` }))
    const result = await pushContacts('access-initial', records)

    const batches = received.filter((r) => r.path.endsWith('/batch/upsert'))
    expect(batches).toHaveLength(3)
    expect(JSON.parse(batches[0].body).inputs).toHaveLength(100)
    expect(JSON.parse(batches[2].body).inputs).toHaveLength(50)
    expect(result.created).toBe(250)
  })

  it('reports an expired token as unauthorized so the caller can reconnect', async () => {
    batchHandler = (_b, res) => json(res, 401, { message: 'expired' })
    await expect(pushContacts('stale', [{ email: 'a@b.test' }])).rejects.toThrow(/must be reconnected/)
  })

  it('explains a 403 as a scope problem', async () => {
    batchHandler = (_b, res) => json(res, 403, { message: 'insufficient scope' })
    await expect(pushContacts('access-initial', [{ email: 'a@b.test' }])).rejects.toThrow(
      /insufficient scope/
    )
  })

  it('records per-record failures instead of losing the batch', async () => {
    batchHandler = (_b, res) => json(res, 400, { message: 'invalid property' })
    const result = await pushContacts('access-initial', [{ email: 'a@b.test' }, { email: 'c@d.test' }])

    expect(result.created).toBe(0)
    expect(result.failed).toHaveLength(2)
    expect(result.failed[0]).toEqual({ index: 0, reason: 'invalid property' })
  })

  it('rejects an empty record list', async () => {
    await expect(pushContacts('access-initial', [])).rejects.toThrow(/non-empty/)
  })
})

// ─── UPSERT AND PARTIAL FAILURE ──────────────────────────────

describe('pushContacts — idempotency and partial failures', () => {
  it('upserts on email so a re-run does not duplicate', async () => {
    // batch/create rejects a duplicate email and fails the whole batch with
    // it, so create is not usable for repeatable pushes.
    await pushContacts('access-initial', [{ email: 'ada@example.com', firstname: 'Ada' }])

    expect(last().path).toBe('/crm/v3/objects/contacts/batch/upsert')
    const input = JSON.parse(last().body).inputs[0]
    expect(input.idProperty).toBe('email')
    expect(input.id).toBe('ada@example.com')
  })

  it('creates records that carry no email, since nothing can be matched on', async () => {
    await pushContacts('access-initial', [{ firstname: 'Anonymous', company: 'Unknown Ltd' }])
    expect(last().path).toBe('/crm/v3/objects/contacts/batch/create')
    expect(JSON.parse(last().body).inputs[0].idProperty).toBeUndefined()
  })

  it('routes a mixed list to both endpoints', async () => {
    await pushContacts('access-initial', [
      { email: 'ada@example.com' },
      { firstname: 'No Email' },
    ])
    const paths = received.filter((r) => r.path.includes('/batch/')).map((r) => r.path)
    expect(paths).toContain('/crm/v3/objects/contacts/batch/upsert')
    expect(paths).toContain('/crm/v3/objects/contacts/batch/create')
  })

  it('counts an update separately from a create', async () => {
    batchHandler = (_b, res) =>
      json(res, 200, { results: [{ id: 'c-1', new: true }, { id: 'c-2', new: false }] })

    const result = await pushContacts('access-initial', [
      { email: 'new@example.com' },
      { email: 'existing@example.com' },
    ])
    expect(result.created).toBe(1)
    expect(result.updated).toBe(1)
  })

  it('does not report a 207 partial failure as total success', async () => {
    // 207 passes response.ok. Treating ok as success silently reports
    // records as written that HubSpot rejected.
    batchHandler = (_b, res) =>
      json(res, 207, {
        results: [{ id: 'c-1' }],
        errors: [{ message: 'Property "phone" is invalid' }],
        numErrors: 1,
      })

    const result = await pushContacts('access-initial', [
      { email: 'ok@example.com' },
      { email: 'bad@example.com', phone: 'nonsense' },
    ])

    expect(result.created).toBe(1)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].reason).toMatch(/phone/)
  })

  it('reports failures against the caller original index', async () => {
    batchHandler = (_b, res) => json(res, 400, { message: 'invalid property' })
    // Only the second record has no email, so it goes to a different batch;
    // its reported index must still be 1.
    const result = await pushContacts('access-initial', [{ email: 'a@b.test' }, { firstname: 'X' }])
    expect(result.failed.map((f) => f.index).sort()).toEqual([0, 1])
  })
})
