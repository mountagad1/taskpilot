import { describe, it, expect, vi } from 'vitest'
import { TaskPilotApiClient, DEFAULT_BASE_URL, HttpClient } from './index'

interface Call {
  url: string
  init: RequestInit
}

/** A fetch stub that records each call and answers with `body`. */
function mockFetch(
  body: unknown = { data: {} },
  contentType = 'application/json'
): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = []
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    const text = typeof body === 'string' ? body : JSON.stringify(body)
    return new Response(text, { status: 200, headers: { 'content-type': contentType } })
  }) as unknown as typeof fetch
  return { fetchImpl, calls }
}

function client(baseUrl?: string, body?: unknown, contentType?: string) {
  const { fetchImpl, calls } = mockFetch(body, contentType)
  return { api: new TaskPilotApiClient({ baseUrl, fetchImpl, apiKey: 'tp_live_test', maxRetries: 0 }), calls }
}

describe('base URL handling', () => {
  it('defaults to the production proxy at https://taskpilot.cc/api', async () => {
    expect(DEFAULT_BASE_URL).toBe('https://taskpilot.cc/api')
    const { api, calls } = client(undefined, { data: [], meta: { total: 0 } })
    await api.agents.list()
    expect(calls[0].url).toBe('https://taskpilot.cc/api/v1/agents')
  })

  it('keeps a path prefix on the base URL', async () => {
    const { api, calls } = client('https://taskpilot.cc/api')
    await api.agents.get('a1')
    expect(calls[0].url).toBe('https://taskpilot.cc/api/v1/agents/a1')
  })

  it('ignores trailing slashes on the base URL', async () => {
    const { api, calls } = client('https://taskpilot.cc/api///')
    await api.agents.get('a1')
    expect(calls[0].url).toBe('https://taskpilot.cc/api/v1/agents/a1')
  })

  it('works against a local API with no prefix', async () => {
    const { api, calls } = client('http://localhost:4000/')
    await api.runs.get('r1')
    expect(calls[0].url).toBe('http://localhost:4000/v1/runs/r1')
  })

  it('does not double /v1 when the base URL already ends with it', async () => {
    const { api, calls } = client('http://localhost:4000/v1/')
    await api.runs.get('r1')
    expect(calls[0].url).toBe('http://localhost:4000/v1/runs/r1')
  })

  it('treats an empty base URL as unset', () => {
    const http = new HttpClient({ baseUrl: '', fetchImpl: mockFetch().fetchImpl })
    expect(http.buildUrl('/v1/me')).toBe('https://taskpilot.cc/api/v1/me')
  })

  it('appends query parameters and skips undefined ones', async () => {
    const { api, calls } = client('https://taskpilot.cc/api/', { data: [], meta: { total: 0 } })
    await api.marketplace.browse({ q: 'price', sort: 'newest', category: undefined, free: true })
    const url = new URL(calls[0].url)
    expect(url.origin + url.pathname).toBe('https://taskpilot.cc/api/v1/marketplace/agents')
    expect(url.searchParams.get('q')).toBe('price')
    expect(url.searchParams.get('sort')).toBe('newest')
    expect(url.searchParams.get('free')).toBe('true')
    expect(url.searchParams.has('category')).toBe(false)
  })

  it('encodes ids as a single path segment', async () => {
    const { api, calls } = client('http://localhost:4000')
    await api.agents.get('../keys')
    expect(calls[0].url).toBe('http://localhost:4000/v1/agents/..%2Fkeys')
  })
})

describe('routes match the backend', () => {
  it('fetches a manifest from /v1/agents/:id/manifest and parses the bare JSON', async () => {
    const manifest = { name: 'Agent', slug: 'agent', version: '1.2.0', goal: 'Do it' }
    const { api, calls } = client('https://taskpilot.cc/api', manifest)
    const result = await api.agents.manifest('a1', '1.2.0')
    expect(calls[0].url).toBe('https://taskpilot.cc/api/v1/agents/a1/manifest?version=1.2.0')
    expect(calls[0].init.method).toBe('GET')
    expect(result).toEqual(manifest)
  })

  it('checks out through POST /v1/billing/checkout with { agentId }', async () => {
    const { api, calls } = client('https://taskpilot.cc/api', { data: { url: 'https://checkout' } })
    const result = await api.marketplace.checkout('a1')
    expect(calls[0].url).toBe('https://taskpilot.cc/api/v1/billing/checkout')
    expect(calls[0].init.method).toBe('POST')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ agentId: 'a1' })
    expect(result).toEqual({ url: 'https://checkout' })
  })

  it('exports through POST /v1/exports and returns the file body', async () => {
    const { api, calls } = client('https://taskpilot.cc/api', 'a,b\n1,2\n', 'text/csv; charset=utf-8')
    const csv = await api.exports.create({ format: 'csv', data: [{ a: 1, b: 2 }] })
    expect(calls[0].url).toBe('https://taskpilot.cc/api/v1/exports')
    expect(csv).toBe('a,b\n1,2\n')
  })

  it('parses a JSON export as rows rather than unwrapping an envelope', async () => {
    const rows = [{ data: 'kept', meta: 'kept' }]
    const { api } = client('http://localhost:4000', rows)
    expect(await api.exports.create({ format: 'json', data: rows })).toEqual(rows)
  })

  it('completes a run with PATCH /v1/runs/:id', async () => {
    const { api, calls } = client('http://localhost:4000', { data: { run: {}, already_finished: false } })
    await api.runs.complete('r1', { status: 'completed' })
    expect(calls[0].url).toBe('http://localhost:4000/v1/runs/r1')
    expect(calls[0].init.method).toBe('PATCH')
  })

  it('reports steps with POST /v1/runs/:id/steps', async () => {
    const { api, calls } = client('http://localhost:4000', { data: { recorded: true } })
    await api.runs.reportStep('r1', { step_index: 0, status: 'succeeded' })
    expect(calls[0].url).toBe('http://localhost:4000/v1/runs/r1/steps')
    expect(calls[0].init.method).toBe('POST')
  })
})

describe('authentication', () => {
  it('sends the key as a Bearer token and no cookies', async () => {
    const { api, calls } = client('http://localhost:4000')
    await api.agents.get('a1')
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer tp_live_test')
    expect(calls[0].init.credentials).toBeUndefined()
  })

  it('does not opt into cookies when no key is given either', async () => {
    const { fetchImpl, calls } = mockFetch({ data: [], meta: { total: 0 } })
    const api = new TaskPilotApiClient({ baseUrl: 'http://localhost:4000', fetchImpl })
    await api.marketplace.browse()
    expect(calls[0].init.credentials).toBeUndefined()
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBeUndefined()
  })
})
