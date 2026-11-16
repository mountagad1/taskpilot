'use client'

// Two ways in:
//  - from the password reset email: Supabase redirects here with a recovery
//    session in the URL fragment (see parseRecoveryLink in lib/client/auth);
//  - signed in, to change the current password.
// The recovery tokens are read once, kept in memory only, and scrubbed from
// the address bar immediately so they do not linger in history or leak via
// screenshots and shared URLs.

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AuthError,
  RECOVERY_URL_KEYS,
  completePasswordRecovery,
  isSignedIn,
  parseRecoveryLink,
  updatePassword,
  type RecoveryLink,
  type RecoveryTokens,
} from '@/lib/client/auth'

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)',
  background: 'var(--background)',
  color: 'var(--foreground)',
  fontSize: 14,
  fontFamily: 'var(--font-body)',
  outline: 'none',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontFamily: 'var(--font-heading)',
  fontWeight: 600,
  color: 'var(--foreground-secondary)',
  marginBottom: 6,
}

const errorStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#f87171',
  background: 'rgba(239,68,68,0.1)',
  border: '1px solid rgba(239,68,68,0.25)',
  borderRadius: 'var(--radius-md)',
  padding: '8px 12px',
}

const headingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-heading)',
  fontWeight: 700,
  fontSize: 24,
  marginBottom: 6,
  color: 'var(--foreground)',
}

const linkStyle: React.CSSProperties = { color: 'var(--indigo-light)', textDecoration: 'none' }

type Mode =
  | { kind: 'checking' }
  | { kind: 'recovery'; tokens: RecoveryTokens }
  | { kind: 'session' }
  | { kind: 'invalid'; message: string }
  | { kind: 'signed-out' }

/** Removes the recovery fragment and any recovery query keys from the address bar. */
function scrubRecoveryUrl(): void {
  const url = new URL(window.location.href)
  let changed = url.hash !== ''
  url.hash = ''

  for (const key of RECOVERY_URL_KEYS) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key)
      changed = true
    }
  }

  if (changed) {
    // Keep the router's history entry state; only the URL changes.
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`)
  }
}

export default function UpdatePasswordPage() {
  const router = useRouter()

  const [mode, setMode] = useState<Mode>({ kind: 'checking' })
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<'dashboard' | 'login' | null>(null)

  // Read once per mount. A ref (not a local) so React's strict-mode effect
  // replay does not re-read the URL after it has already been scrubbed.
  const link = useRef<RecoveryLink | null>(null)

  useEffect(() => {
    if (link.current === null) {
      link.current = parseRecoveryLink(window.location.hash, window.location.search)
      scrubRecoveryUrl()
    }

    const parsed = link.current
    if (parsed.kind === 'tokens') setMode({ kind: 'recovery', tokens: parsed.tokens })
    else if (parsed.kind === 'error' || parsed.kind === 'unsupported') {
      setMode({ kind: 'invalid', message: parsed.message })
    } else setMode(isSignedIn() ? { kind: 'session' } : { kind: 'signed-out' })
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)

    try {
      if (mode.kind === 'recovery') {
        const session = await completePasswordRecovery(mode.tokens, password)
        if (session) {
          setDone('dashboard')
          setTimeout(() => {
            router.push('/dashboard')
            router.refresh()
          }, 1500)
        } else {
          // Password changed, but the recovery session could not be turned
          // into a sign-in; send them to sign in with the new password.
          setDone('login')
          setTimeout(() => router.push('/auth/login?reset=1'), 1500)
        }
        return
      }

      await updatePassword(password)
      setDone('dashboard')
      setTimeout(() => {
        router.push('/dashboard')
        router.refresh()
      }, 1500)
    } catch (err) {
      if (err instanceof AuthError && err.code === 'recovery_expired') {
        setMode({ kind: 'invalid', message: err.message })
        return
      }
      setError(err instanceof AuthError ? err.message : 'Could not update your password')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
        <h1 style={{ ...headingStyle, fontSize: 22, marginBottom: 8 }}>Password updated</h1>
        <p style={{ fontSize: 14, color: 'var(--foreground-secondary)' }}>
          {done === 'dashboard' ? 'Taking you to your dashboard…' : 'Taking you to sign in…'}
        </p>
      </div>
    )
  }

  if (mode.kind === 'checking') return null

  if (mode.kind === 'invalid' || mode.kind === 'signed-out') {
    return (
      <>
        <h1 style={headingStyle}>
          {mode.kind === 'invalid' ? 'Reset link not valid' : 'Set a new password'}
        </h1>
        {mode.kind === 'invalid' ? (
          <p role="alert" style={{ ...errorStyle, marginTop: 12, marginBottom: 20 }}>
            {mode.message}
          </p>
        ) : (
          <p style={{ fontSize: 14, color: 'var(--foreground-secondary)', marginBottom: 20 }}>
            Open the link in your password reset email to choose a new password, or sign in to
            change it.
          </p>
        )}
        <Link
          href="/auth/reset-password"
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center' }}
        >
          Request a new reset link
        </Link>
        <p
          style={{
            marginTop: 20,
            textAlign: 'center',
            fontSize: 13,
            color: 'var(--foreground-tertiary)',
          }}
        >
          Remembered it?{' '}
          <Link href="/auth/login" style={linkStyle}>
            Sign in
          </Link>
        </p>
      </>
    )
  }

  return (
    <>
      <h1 style={headingStyle}>Set a new password</h1>
      <p style={{ fontSize: 14, color: 'var(--foreground-secondary)', marginBottom: 24 }}>
        Choose a new password for your account.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label htmlFor="password" style={labelStyle}>New password</label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
            placeholder="At least 8 characters"
          />
        </div>

        {error && (
          <p role="alert" style={errorStyle}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center', opacity: loading ? 0.7 : 1 }}
        >
          {loading ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </>
  )
}
