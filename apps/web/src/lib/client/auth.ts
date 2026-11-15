'use client'

// ============================================================
// TASKPILOT WEB — AUTH CLIENT
// apps/web/src/lib/client/auth.ts
//
// The dashboard holds no Supabase SDK. It posts credentials to the API
// service and keeps the returned token pair here, refreshing proactively
// before expiry. Every Supabase detail stays inside the private backend.
//
// Tokens live in localStorage rather than a cookie: the API is on another
// origin, so a cookie would not be sent with its requests anyway, and the
// browser extension is handed the same access token explicitly.
// ============================================================

const STORAGE_KEY = 'taskpilot.session'

/** Refresh this many seconds before expiry, so a request never races it. */
const REFRESH_MARGIN_SECONDS = 120

export interface AuthUser {
  id: string
  email: string
  plan: 'free' | 'pro' | 'enterprise'
}

export interface StoredSession {
  access_token: string
  refresh_token: string
  expires_at: number
  user: AuthUser
}

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '')

// ─── STORAGE ─────────────────────────────────────────────────

type Listener = (session: StoredSession | null) => void

const listeners = new Set<Listener>()

function notify(session: StoredSession | null): void {
  for (const listener of listeners) listener(session)
}

/** Subscribe to sign-in / sign-out, including from another tab. */
export function onSessionChange(listener: Listener): () => void {
  listeners.add(listener)

  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener(readSession())
  }

  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage)

  return () => {
    listeners.delete(listener)
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
  }
}

export function readSession(): StoredSession | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as StoredSession
    if (!parsed?.access_token || !parsed?.user?.id) return null
    return parsed
  } catch {
    // Corrupt or partially written entry: treat as signed out.
    return null
  }
}

function writeSession(session: StoredSession | null): void {
  if (typeof window === 'undefined') return

  if (session) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  else window.localStorage.removeItem(STORAGE_KEY)

  notify(session)
}

// ─── REQUESTS ────────────────────────────────────────────────

export class AuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly issues?: Array<{ path: string; message: string }>,
    /** HTTP status from the API; undefined when the request never got an answer. */
    readonly status?: number
  ) {
    super(message)
    this.name = 'AuthError'
  }

  /**
   * True for failures worth retrying as-is: the API was unreachable, rate
   * limited the call, or failed on its side. Nothing about the credential
   * is known to be wrong.
   */
  get retryable(): boolean {
    if (this.code === 'network_error' || this.code === 'refresh_unavailable') return true
    return this.status === 429 || (this.status !== undefined && this.status >= 500)
  }

  get fieldErrors(): Record<string, string> {
    return Object.fromEntries((this.issues ?? []).map((i) => [i.path, i.message]))
  }
}

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  let response: Response

  try {
    response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })
  } catch {
    throw new AuthError('network_error', 'Could not reach the TaskPilot API. Is it running?')
  }

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string; issues?: [] } } | null)?.error
    throw new AuthError(
      error?.code ?? `http_${response.status}`,
      error?.message ?? `Request failed (${response.status})`,
      error?.issues,
      response.status
    )
  }

  return ((payload as { data?: T } | null)?.data ?? payload) as T
}

// ─── PUBLIC API ──────────────────────────────────────────────

/** Returned when email confirmation is on and there is no session yet. */
export interface SignUpPending {
  requires_confirmation: true
  email: string
}

export type SignUpResult = StoredSession | SignUpPending

/** Discriminates the two shapes `signUp` can return. */
export function isPendingConfirmation(result: SignUpResult): result is SignUpPending {
  return 'requires_confirmation' in result && result.requires_confirmation === true
}

export async function signIn(email: string, password: string): Promise<StoredSession> {
  const session = await post<StoredSession>('/v1/auth/login', { email, password })
  writeSession(session)
  return session
}

export async function signUp(
  email: string,
  password: string,
  name?: string
): Promise<SignUpResult> {
  const result = await post<StoredSession & Partial<SignUpPending>>('/v1/auth/signup', {
    email,
    password,
    name,
  })

  // With email confirmation on there is no session to store yet.
  if (result.requires_confirmation) {
    return { requires_confirmation: true, email: result.email ?? email }
  }

  writeSession(result)
  return result
}

export async function signOut(): Promise<void> {
  const session = readSession()
  writeSession(null)

  // Fire-and-forget: the local session is already gone, and a failed
  // revocation must not leave the user stuck on a signed-in screen.
  if (session) {
    void post('/v1/auth/logout', {}, session.access_token).catch(() => undefined)
  }
}

export async function requestPasswordReset(email: string, redirectTo?: string): Promise<void> {
  await post('/v1/auth/reset-password', { email, redirect_to: redirectTo })
}

/** Changes the password of the signed-in user. */
export async function updatePassword(password: string): Promise<void> {
  const token = await getAccessToken()
  if (!token) throw new AuthError('unauthorized', 'Sign in before changing your password')
  await post('/v1/auth/update-password', { password }, token)
}

// ─── PASSWORD RECOVERY ───────────────────────────────────────
//
// The API calls Supabase's resetPasswordForEmail() through a client on the
// default (implicit) flow, so the emailed link verifies the one-time token on
// Supabase and redirects to `redirect_to` with a recovery session in the URL
// fragment:
//
//   /auth/update-password#access_token=…&refresh_token=…&expires_at=…&type=recovery
//
// or, when the link is expired or already used:
//
//   /auth/update-password#error=access_denied&error_code=otp_expired&error_description=…
//
// A PKCE link (`?code=`) cannot occur: the API's auth client keeps no
// storage, so the code verifier needed to exchange it is already gone. A
// `?token_hash=` link only appears with a customised email template, and
// verifying it needs an API endpoint (verifyOtp) that does not exist. Both
// are reported as unsupported rather than silently ignored.

export interface RecoveryTokens {
  access_token: string
  refresh_token: string
  /** Absolute seconds since epoch, when the link said so. */
  expires_at?: number
}

export type RecoveryLink =
  | { kind: 'none' }
  | { kind: 'tokens'; tokens: RecoveryTokens }
  | { kind: 'error'; code: string; message: string }
  | { kind: 'unsupported'; message: string }

export const EXPIRED_RECOVERY_MESSAGE =
  'This password reset link is invalid or has expired. Request a new one.'

/** Query/fragment keys that belong to a recovery link, stripped from the URL once read. */
export const RECOVERY_URL_KEYS = [
  'access_token',
  'refresh_token',
  'expires_at',
  'expires_in',
  'token_type',
  'type',
  'provider_token',
  'provider_refresh_token',
  'code',
  'token_hash',
  'error',
  'error_code',
  'error_description',
] as const

/**
 * Reads what Supabase put on the reset link. Pure: pass it
 * `window.location.hash` and `window.location.search`.
 */
export function parseRecoveryLink(
  hash: string,
  search: string,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): RecoveryLink {
  const fragment = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
  const query = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const pick = (key: string) => fragment.get(key) ?? query.get(key)

  const error = pick('error') ?? pick('error_code')
  if (error) {
    const code = pick('error_code') ?? error
    const known = code === 'otp_expired' || code === 'access_denied'
    return {
      kind: 'error',
      code,
      message: known ? EXPIRED_RECOVERY_MESSAGE : pick('error_description') || EXPIRED_RECOVERY_MESSAGE,
    }
  }

  const accessToken = fragment.get('access_token')
  if (accessToken) {
    const refreshToken = fragment.get('refresh_token')
    if (fragment.get('type') !== 'recovery' || !refreshToken) {
      return { kind: 'error', code: 'invalid_link', message: EXPIRED_RECOVERY_MESSAGE }
    }

    const expiresAt = Number(fragment.get('expires_at'))
    const expiresIn = Number(fragment.get('expires_in'))
    const expires_at =
      Number.isFinite(expiresAt) && expiresAt > 0
        ? expiresAt
        : Number.isFinite(expiresIn) && expiresIn > 0
          ? nowSeconds + expiresIn
          : undefined

    return {
      kind: 'tokens',
      tokens: { access_token: accessToken, refresh_token: refreshToken, expires_at },
    }
  }

  if (query.get('code') || query.get('token_hash')) {
    return {
      kind: 'unsupported',
      message:
        'This password reset link is in a format TaskPilot does not support. Request a new one.',
    }
  }

  return { kind: 'none' }
}

/**
 * Sets a new password with the recovery session from a reset link, then
 * signs the user in with it. Returns the stored session, or null when the
 * password changed but signing in did not work (send the user to sign in).
 */
export async function completePasswordRecovery(
  tokens: RecoveryTokens,
  password: string
): Promise<StoredSession | null> {
  let accessToken = tokens.access_token
  let refreshToken = tokens.refresh_token
  let fresh: StoredSession | null = null

  // The recovery access token lives about an hour; if the page sat open
  // longer than that, trade the refresh token for a new one first.
  const now = Math.floor(Date.now() / 1000)
  if (tokens.expires_at !== undefined && tokens.expires_at - now <= 30) {
    try {
      fresh = await post<StoredSession>('/v1/auth/refresh', { refresh_token: refreshToken })
      accessToken = fresh.access_token
      refreshToken = fresh.refresh_token
    } catch (err) {
      throw recoveryError(err)
    }
  }

  try {
    await post('/v1/auth/update-password', { password }, accessToken)
  } catch (err) {
    throw recoveryError(err)
  }

  // Exchange the recovery pair for a regular stored session so the user
  // lands on the dashboard signed in. Best-effort: the password is already
  // changed, so a failure here only means signing in by hand.
  try {
    const session =
      fresh ?? (await post<StoredSession>('/v1/auth/refresh', { refresh_token: refreshToken }))
    writeSession(session)
    return session
  } catch {
    return null
  }
}

function recoveryError(err: unknown): unknown {
  if (err instanceof AuthError && (err.status === 401 || err.status === 400 || err.status === 403)) {
    // 400 from /refresh means a malformed token; 422 (weak password) and
    // other validation errors pass through untouched.
    return new AuthError('recovery_expired', EXPIRED_RECOVERY_MESSAGE, undefined, err.status)
  }
  return err
}

// ─── REDIRECTS ───────────────────────────────────────────────

/**
 * A `?redirect=` value made safe to follow after sign-in. Only a same-origin
 * path is allowed (one leading `/`, never `//` or `/\`, no scheme); anything
 * else yields `fallback`, so the parameter cannot bounce a freshly signed-in
 * user to another site.
 */
export function safeRedirectPath(
  value: string | null | undefined,
  origin: string = typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
  fallback = '/dashboard'
): string {
  if (!value) return fallback

  // URL parsing drops tabs and newlines ("/\t/evil.com" becomes "//evil.com"),
  // so refuse control characters outright rather than reason about them.
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return fallback
  }

  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback

  try {
    const base = new URL(origin)
    const url = new URL(value, base)
    if (url.origin !== base.origin) return fallback
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return fallback
  }
}

// ─── TOKEN ACCESS ────────────────────────────────────────────

let refreshInFlight: Promise<StoredSession | null> | null = null

/**
 * True when the API rejected the refresh token itself (401, or 400 for a
 * malformed one), as opposed to being unreachable or briefly unavailable.
 */
export function isRefreshRejection(err: unknown): boolean {
  return err instanceof AuthError && (err.status === 401 || err.status === 400)
}

async function refresh(session: StoredSession): Promise<StoredSession | null> {
  // Collapse concurrent refreshes: several components may call
  // getAccessToken() in the same tick, and each rotation invalidates the
  // previous refresh token.
  if (refreshInFlight) return refreshInFlight

  refreshInFlight = post<StoredSession>('/v1/auth/refresh', {
    refresh_token: session.refresh_token,
  })
    .then((next) => {
      writeSession(next)
      return next
    })
    .catch((err: unknown) => {
      // Only a definitive rejection of the refresh token ends the session.
      // An unreachable, rate-limited or failing API says nothing about the
      // credential — clearing here would also sign out every other tab via
      // the storage event — so keep the session and let the caller retry.
      if (!isRefreshRejection(err)) {
        throw new AuthError(
          'refresh_unavailable',
          'Could not refresh your session right now. Check your connection and try again.',
          undefined,
          err instanceof AuthError ? err.status : undefined
        )
      }

      // Another tab may have rotated the pair while this request was in
      // flight, which invalidates the token sent here; its session is live.
      const latest = readSession()
      if (latest && latest.refresh_token !== session.refresh_token) return latest

      writeSession(null)
      return null
    })
    .finally(() => {
      refreshInFlight = null
    })

  return refreshInFlight
}

/**
 * The token to send as a Bearer credential, refreshed if it is about to
 * expire. Returns null when signed out (including when the API rejected the
 * refresh token). Throws a retryable AuthError (`refresh_unavailable`) when
 * the token has expired and could not be refreshed for a transient reason;
 * the session is kept, so a later call can succeed.
 */
export async function getAccessToken(): Promise<string | null> {
  const session = readSession()
  if (!session) return null

  const secondsLeft = session.expires_at - Math.floor(Date.now() / 1000)
  if (secondsLeft > REFRESH_MARGIN_SECONDS) return session.access_token

  try {
    const refreshed = await refresh(session)
    return refreshed?.access_token ?? null
  } catch (err) {
    // Inside the margin but not yet expired: the current token still works.
    if (secondsLeft > 0) return session.access_token
    throw err
  }
}

export function currentUser(): AuthUser | null {
  return readSession()?.user ?? null
}

export function isSignedIn(): boolean {
  return readSession() !== null
}
