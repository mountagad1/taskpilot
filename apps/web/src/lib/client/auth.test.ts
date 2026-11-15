// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import {
  AuthError,
  completePasswordRecovery,
  currentUser,
  getAccessToken,
  isPendingConfirmation,
  isSignedIn,
  onSessionChange,
  parseRecoveryLink,
  readSession,
  safeRedirectPath,
  signIn,
  signOut,
  signUp,
  updatePassword,
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

  it('signs out when the API calls the refresh token malformed (400)', async () => {
    mockFetch([{ body: { data: session({ expires_at: NOW + 30 }) } }])
    await signIn('ada@example.com', 'x')

    mockFetch([{ status: 400, body: { error: { code: 'bad_request', message: 'bad' } } }])

    expect(await getAccessToken()).toBeNull()
    expect(isSignedIn()).toBe(false)
  })

  it.each([
    ['a 503', { status: 503, body: { error: { code: 'unavailable', message: 'down' } } }],
    ['a 429', { status: 429, body: { error: { code: 'rate_limited', message: 'slow down' } } }],
    ['a 500 without a body', { status: 500, body: null }],
  ])('keeps the session when the refresh fails with %s', async (_label, response) => {
    // Already expired, so there is no usable token to fall back on.
    mockFetch([{ body: { data: session({ expires_at: NOW - 10 }) } }])
    await signIn('ada@example.com', 'x')

    const seen: Array<StoredSession | null> = []
    const unsubscribe = onSessionChange((s) => seen.push(s))
    mockFetch([response])

    const failure = await getAccessToken().catch((err: unknown) => err)

    expect(failure).toBeInstanceOf(AuthError)
    expect(failure).toMatchObject({ code: 'refresh_unavailable', retryable: true })
    expect(isSignedIn()).toBe(true)
    expect(readSession()?.refresh_token).toBe('refresh-1')
    // No sign-out broadcast, so other tabs stay signed in too.
    expect(seen).toEqual([])
    unsubscribe()
  })

  it('keeps the session when the API is unreachable during a refresh', async () => {
    mockFetch([{ body: { data: session({ expires_at: NOW - 10 }) } }])
    await signIn('ada@example.com', 'x')

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      })
    )

    await expect(getAccessToken()).rejects.toMatchObject({
      code: 'refresh_unavailable',
      retryable: true,
    })
    expect(isSignedIn()).toBe(true)
  })

  it('falls back to the current token when a refresh fails before it has expired', async () => {
    mockFetch([{ body: { data: session({ expires_at: NOW + 30 }) } }])
    await signIn('ada@example.com', 'x')

    mockFetch([{ status: 503, body: {} }])

    expect(await getAccessToken()).toBe('access-1')
    expect(isSignedIn()).toBe(true)

    // And a later attempt, once the API is back, succeeds.
    mockFetch([{ body: { data: session({ access_token: 'access-2' }) } }])
    expect(await getAccessToken()).toBe('access-2')
  })

  it('keeps a session another tab rotated while this refresh was rejected', async () => {
    mockFetch([{ body: { data: session({ expires_at: NOW + 30 }) } }])
    await signIn('ada@example.com', 'x')

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        // The other tab wins the race and stores the rotated pair first.
        window.localStorage.setItem(
          'taskpilot.session',
          JSON.stringify(session({ access_token: 'access-other', refresh_token: 'refresh-other' }))
        )
        return {
          ok: false,
          status: 401,
          json: async () => ({ error: { code: 'unauthorized', message: 'used' } }),
        } as Response
      })
    )

    expect(await getAccessToken()).toBe('access-other')
    expect(isSignedIn()).toBe(true)
  })

  it('notifies subscribers with the rotated session after a refresh', async () => {
    mockFetch([{ body: { data: session({ expires_at: NOW + 30 }) } }])
    await signIn('ada@example.com', 'x')

    const seen: Array<string | null> = []
    const unsubscribe = onSessionChange((s) => seen.push(s?.access_token ?? null))
    mockFetch([{ body: { data: session({ access_token: 'access-2' }) } }])

    await getAccessToken()

    expect(seen).toEqual(['access-2'])
    unsubscribe()
  })
})

// ─── PASSWORD ────────────────────────────────────────────────

describe('updatePassword', () => {
  it('still works for a signed-in user', async () => {
    mockFetch([{ body: { data: session() } }])
    await signIn('ada@example.com', 'x')

    const { calls } = mockFetch([{ body: { data: { updated: true } } }])
    await updatePassword('new-password-1')

    expect(calls[0].url).toContain('/v1/auth/update-password')
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer access-1')
  })

  it('refuses without a session', async () => {
    await expect(updatePassword('new-password-1')).rejects.toMatchObject({ code: 'unauthorized' })
  })
})

describe('parseRecoveryLink', () => {
  it('reads the recovery session Supabase puts in the fragment', () => {
    const link = parseRecoveryLink(
      '#access_token=at&expires_at=1800003600&expires_in=3600&refresh_token=rt&token_type=bearer&type=recovery',
      ''
    )
    expect(link).toEqual({
      kind: 'tokens',
      tokens: { access_token: 'at', refresh_token: 'rt', expires_at: 1800003600 },
    })
  })

  it('derives expires_at from expires_in when absent', () => {
    const link = parseRecoveryLink('#access_token=at&refresh_token=rt&expires_in=3600&type=recovery', '', NOW)
    expect(link).toMatchObject({ kind: 'tokens', tokens: { expires_at: NOW + 3600 } })
  })

  it('reports an expired or already-used link', () => {
    const link = parseRecoveryLink(
      '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
      ''
    )
    expect(link).toMatchObject({ kind: 'error', code: 'otp_expired' })
    expect(link.kind === 'error' && link.message).toMatch(/expired/)
  })

  it('reads errors from the query string too', () => {
    expect(parseRecoveryLink('', '?error=server_error&error_description=Boom')).toEqual({
      kind: 'error',
      code: 'server_error',
      message: 'Boom',
    })
  })

  it('rejects tokens that are not a recovery session', () => {
    expect(parseRecoveryLink('#access_token=at&refresh_token=rt&type=signup', '')).toMatchObject({
      kind: 'error',
      code: 'invalid_link',
    })
    expect(parseRecoveryLink('#access_token=at&type=recovery', '')).toMatchObject({ kind: 'error' })
  })

  it('flags PKCE and token_hash links as unsupported', () => {
    expect(parseRecoveryLink('', '?code=abc')).toMatchObject({ kind: 'unsupported' })
    expect(parseRecoveryLink('', '?token_hash=abc&type=recovery')).toMatchObject({
      kind: 'unsupported',
    })
  })

  it('returns none for a plain visit', () => {
    expect(parseRecoveryLink('', '')).toEqual({ kind: 'none' })
  })
})

describe('completePasswordRecovery', () => {
  const tokens = { access_token: 'rec-at', refresh_token: 'rec-rt', expires_at: NOW + 3600 }

  it('sets the password with the recovery token and signs the user in', async () => {
    const { calls } = mockFetch([
      { body: { data: { updated: true } } },
      { body: { data: session({ access_token: 'access-9' }) } },
    ])

    const result = await completePasswordRecovery(tokens, 'new-password-1')

    expect(calls[0].url).toContain('/v1/auth/update-password')
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer rec-at')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ password: 'new-password-1' })
    expect(calls[1].url).toContain('/v1/auth/refresh')
    expect(result?.access_token).toBe('access-9')
    expect(readSession()?.access_token).toBe('access-9')
  })

  it('needs no stored session', async () => {
    expect(isSignedIn()).toBe(false)
    mockFetch([{ body: { data: { updated: true } } }, { body: { data: session() } }])
    await expect(completePasswordRecovery(tokens, 'new-password-1')).resolves.not.toBeNull()
  })

  it('maps a rejected recovery token to an expired-link error', async () => {
    mockFetch([{ status: 401, body: { error: { code: 'unauthorized', message: 'expired' } } }])

    await expect(completePasswordRecovery(tokens, 'new-password-1')).rejects.toMatchObject({
      code: 'recovery_expired',
    })
    expect(isSignedIn()).toBe(false)
  })

  it('refreshes an expired recovery token before using it', async () => {
    const { calls } = mockFetch([
      { body: { data: session({ access_token: 'fresh-at', refresh_token: 'fresh-rt' }) } },
      { body: { data: { updated: true } } },
    ])

    await completePasswordRecovery({ ...tokens, expires_at: NOW - 5 }, 'new-password-1')

    expect(calls[0].url).toContain('/v1/auth/refresh')
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe('Bearer fresh-at')
    expect(calls).toHaveLength(2)
    expect(readSession()?.access_token).toBe('fresh-at')
  })

  it('returns null when the password changed but sign-in did not', async () => {
    mockFetch([{ body: { data: { updated: true } } }, { status: 401, body: {} }])
    await expect(completePasswordRecovery(tokens, 'new-password-1')).resolves.toBeNull()
  })
})

// ─── REDIRECTS ───────────────────────────────────────────────

describe('safeRedirectPath', () => {
  const origin = 'https://app.taskpilot.dev'

  it.each([
    'https://evil.com',
    '//evil.com',
    '/\\evil.com',
    'javascript:alert(1)',
    'evil.com',
    '/\t/evil.com',
    '\\\\evil.com',
    'http://app.taskpilot.dev.evil.com/x',
  ])('rejects %j', (value) => {
    expect(safeRedirectPath(value, origin)).toBe('/dashboard')
  })

  it('accepts a same-origin path with a query', () => {
    expect(safeRedirectPath('/dashboard/runs?x=1', origin)).toBe('/dashboard/runs?x=1')
  })

  it('falls back when the value is missing', () => {
    expect(safeRedirectPath(null, origin)).toBe('/dashboard')
    expect(safeRedirectPath('', origin)).toBe('/dashboard')
  })

  it('uses the current origin by default', () => {
    expect(safeRedirectPath('/marketplace/foo')).toBe('/marketplace/foo')
    expect(safeRedirectPath('//evil.com')).toBe('/dashboard')
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
