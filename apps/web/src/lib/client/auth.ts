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
    readonly issues?: Array<{ path: string; message: string }>
  ) {
    super(message)
    this.name = 'AuthError'
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
      error?.issues
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

export async function updatePassword(password: string): Promise<void> {
  const token = await getAccessToken()
  if (!token) throw new AuthError('unauthorized', 'Sign in before changing your password')
  await post('/v1/auth/update-password', { password }, token)
}

// ─── TOKEN ACCESS ────────────────────────────────────────────

let refreshInFlight: Promise<StoredSession | null> | null = null

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
    .catch(() => {
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
 * expire. Returns null when signed out.
 */
export async function getAccessToken(): Promise<string | null> {
  const session = readSession()
  if (!session) return null

  const secondsLeft = session.expires_at - Math.floor(Date.now() / 1000)
  if (secondsLeft > REFRESH_MARGIN_SECONDS) return session.access_token

  const refreshed = await refresh(session)
  return refreshed?.access_token ?? null
}

export function currentUser(): AuthUser | null {
  return readSession()?.user ?? null
}

export function isSignedIn(): boolean {
  return readSession() !== null
}
