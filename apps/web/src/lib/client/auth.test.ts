// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import {
  AuthError,
  currentUser,
  getAccessToken,
  isPendingConfirmation,
  isSignedIn,
  onSessionChange,
  readSession,
  signIn,
  signOut,
  signUp,
  type StoredSession,
} from './auth'

const NOW = 1_800_000_000

function session(overrides: Partial<StoredSession> = {}): StoredSession {
  return {
    access_token: 'access-1',
    refresh_token: 'refresh-1',
    expires_at: NOW + 3600,
    user: { id: 'u1', email: 'ada@example.com', plan: 'pro' },
    ...overrides,
  }
}

/** Queues fetch responses in order. */
function mockFetch(responses: Array<{ status?: number; body: unknown }>) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  let index = 0

  const impl = vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init })
    const next = responses[Math.min(index++, responses.length - 1)]
    return {
      ok: (next.status ?? 200) < 400,
      status: next.status ?? 200,
      json: async () => next.body,
    } as Response
  })

  vi.stubGlobal('fetch', impl)
  return { calls, impl }
}

beforeEach(() => {
  window.localStorage.clear()
  vi.spyOn(Date, 'now').mockReturnValue(NOW * 1000)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ─── SIGN IN / OUT ───────────────────────────────────────────

describe('signIn', () => {
  it('stores the session and posts to the API', async () => {
    const { calls } = mockFetch([{ body: { data: session() } }])

    const result = await signIn('ada@example.com', 'hunter2')

    expect(result.user.email).toBe('ada@example.com')
    expect(readSession()?.access_token).toBe('access-1')
    expect(calls[0].url).toContain('/v1/auth/login')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      email: 'ada@example.com',
      password: 'hunter2',
    })
  })

  it('raises a typed error carrying the API code and field issues', async () => {
    mockFetch([
      {
        status: 422,
        body: {
          error: {
            code: 'validation_failed',
            message: 'Bad input',
            issues: [{ path: 'email', message: 'Enter a valid email address' }],
          },
        },
      },
    ])

    await expect(signIn('nope', '')).rejects.toBeInstanceOf(AuthError)

    try {
      await signIn('nope', '')
    } catch (err) {
      const authError = err as AuthError
      expect(authError.code).toBe('validation_failed')
      expect(authError.fieldErrors.email).toBe('Enter a valid email address')
    }

    // A failed sign-in must not leave a session behind.
    expect(isSignedIn()).toBe(false)
  })

  it('reports an unreachable API distinctly from a rejected credential', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      })
    )

    await expect(signIn('ada@example.com', 'x')).rejects.toMatchObject({
      code: 'network_error',
    })
  })
})

describe('signOut', () => {
  it('clears local state immediately, before the network call resolves', async () => {
    mockFetch([{ body: { data: session() } }, { body: { data: { signed_out: true } } }])
    await signIn('ada@example.com', 'x')
    expect(isSignedIn()).toBe(true)

    await signOut()

    expect(isSignedIn()).toBe(false)
    expect(currentUser()).toBeNull()
  })

  it('still signs out locally when revocation fails', async () => {
    mockFetch([{ body: { data: session() } }, { status: 500, body: {} }])
    await signIn('ada@example.com', 'x')

    await expect(signOut()).resolves.toBeUndefined()
    expect(isSignedIn()).toBe(false)
  })
})

// ─── SIGN UP ─────────────────────────────────────────────────

describe('signUp', () => {
  it('stores a session when the API returns one', async () => {
    mockFetch([{ status: 201, body: { data: session() } }])

    const result = await signUp('ada@example.com', 'longenoughpw', 'Ada')

    expect(isPendingConfirmation(result)).toBe(false)
    expect(readSession()).not.toBeNull()
  })

  it('returns a pending result without storing anything when confirmation is required', async () => {
    mockFetch([
      { status: 201, body: { data: { requires_confirmation: true, email: 'ada@example.com' } } },
    ])

    const result = await signUp('ada@example.com', 'longenoughpw')

    expect(isPendingConfirmation(result)).toBe(true)
    // There is no session yet, so nothing should be persisted.
    expect(readSession()).toBeNull()
  })
})

// ─── TOKEN REFRESH ───────────────────────────────────────────

describe('getAccessToken', () => {
  it('returns null when signed out', async () => {
    expect(await getAccessToken()).toBeNull()
  })

  it('returns the stored token while it is still fresh', async () => {
    mockFetch([{ body: { data: session() } }])
    await signIn('ada@example.com', 'x')

    const { calls } = mockFetch([{ body: { data: session() } }])
    expect(await getAccessToken()).toBe('access-1')
    // No refresh needed, so no request.
    expect(calls).toHaveLength(0)
  })

  it('refreshes when the token is inside the expiry margin', async () => {
    mockFetch([{ body: { data: session({ expires_at: NOW + 30 }) } }])
    await signIn('ada@example.com', 'x')

    const { calls } = mockFetch([
      { body: { data: session({ access_token: 'access-2', refresh_token: 'refresh-2' }) } },
    ])

    expect(await getAccessToken()).toBe('access-2')
    expect(calls[0].url).toContain('/v1/auth/refresh')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ refresh_token: 'refresh-1' })
    // The rotated pair replaces the old one.
    expect(readSession()?.refresh_token).toBe('refresh-2')
  })

  it('collapses concurrent refreshes into one request', async () => {
    mockFetch([{ body: { data: session({ expires_at: NOW + 30 }) } }])
    await signIn('ada@example.com', 'x')

    const { calls } = mockFetch([{ body: { data: session({ access_token: 'access-2' }) } }])

    // Each rotation invalidates the previous refresh token, so firing three
    // in parallel must not produce three requests.
    const tokens = await Promise.all([getAccessToken(), getAccessToken(), getAccessToken()])

    expect(tokens).toEqual(['access-2', 'access-2', 'access-2'])
    expect(calls).toHaveLength(1)
  })

  it('signs out when the refresh token is rejected', async () => {
    mockFetch([{ body: { data: session({ expires_at: NOW + 30 }) } }])
    await signIn('ada@example.com', 'x')

    mockFetch([{ status: 401, body: { error: { code: 'unauthorized', message: 'expired' } } }])

    expect(await getAccessToken()).toBeNull()
    expect(isSignedIn()).toBe(false)
  })
})

// ─── STORAGE ─────────────────────────────────────────────────

describe('session storage', () => {
  it('treats a corrupt entry as signed out rather than throwing', () => {
    window.localStorage.setItem('taskpilot.session', '{not json')
    expect(readSession()).toBeNull()
    expect(isSignedIn()).toBe(false)
  })

  it('rejects a partially written entry', () => {
    window.localStorage.setItem('taskpilot.session', JSON.stringify({ access_token: 'x' }))
    expect(readSession()).toBeNull()
  })

  it('notifies subscribers on sign-in and sign-out', async () => {
    const seen: Array<string | null> = []
    const unsubscribe = onSessionChange((s) => seen.push(s?.user.email ?? null))

    mockFetch([{ body: { data: session() } }, { body: { data: {} } }])
    await signIn('ada@example.com', 'x')
    await signOut()

    expect(seen).toEqual(['ada@example.com', null])
    unsubscribe()
  })
})
