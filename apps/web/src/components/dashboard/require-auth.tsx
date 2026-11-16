'use client'

// ============================================================
// TASKPILOT WEB — CLIENT AUTH BOUNDARY
// apps/web/src/components/dashboard/require-auth.tsx
//
// Route protection moved to the client with the backend split: this app no
// longer holds a session cookie to check server-side. That is a UX guard,
// not a security one — the API service authenticates every request
// independently, so a user who bypasses this sees an empty dashboard, not
// someone else's data.
// ============================================================

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import type { PlanType } from '@taskpilot/shared'

import { AuthProvider } from '@/components/dashboard/auth-context'
import {
  AuthError,
  getAccessToken,
  onSessionChange,
  readSession,
  type StoredSession,
} from '@/lib/client/auth'
import { notifyExtensionSignedIn, notifyExtensionSignedOut } from '@/lib/extension-bridge'

type State =
  | { status: 'checking' }
  | { status: 'signed-out' }
  | { status: 'unavailable'; message: string }
  | { status: 'ready'; email: string; plan: PlanType }

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ status: 'checking' })
  const [attempt, setAttempt] = useState(0)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    let active = true

    // The extension authenticates with the same token, so hand it the
    // current one on every mount and after every refresh. A refresh (in this
    // tab or another) rewrites the stored session, which reaches us through
    // onSessionChange below; skip a token this mount already sent.
    let lastSentToken: string | null = null
    const sendToExtension = (session: StoredSession, token: string) => {
      if (token === lastSentToken) return
      lastSentToken = token
      notifyExtensionSignedIn({
        userId: session.user.id,
        email: session.user.email,
        authToken: token,
        plan: session.user.plan,
      })
    }

    const resolve = async () => {
      const session = readSession()

      if (!session) {
        if (!active) return
        setState({ status: 'signed-out' })
        router.replace(`/auth/login?redirect=${encodeURIComponent(pathname)}`)
        return
      }

      // Refreshes if the token is close to expiry, so the dashboard never
      // renders with a credential the API is about to reject.
      let token: string | null
      try {
        token = await getAccessToken()
      } catch (err) {
        // The token expired and the API could not be reached to refresh it.
        // The session is kept, so offer a retry instead of signing out.
        if (!active) return
        setState({
          status: 'unavailable',
          message:
            err instanceof AuthError ? err.message : 'Could not reach TaskPilot. Try again.',
        })
        return
      }
      if (!active) return

      if (!token) {
        setState({ status: 'signed-out' })
        router.replace('/auth/login')
        return
      }

      // A refresh above stored a new session; send its user with its token.
      sendToExtension(readSession() ?? session, token)

      setState({ status: 'ready', email: session.user.email, plan: session.user.plan })
    }

    // A sign-out in another tab should bounce this one too, and every token
    // refresh is forwarded to the extension.
    const unsubscribe = onSessionChange((session) => {
      if (!active) return

      if (!session) {
        notifyExtensionSignedOut()
        setState({ status: 'signed-out' })
        router.replace('/auth/login')
        return
      }

      sendToExtension(session, session.access_token)
      setState({ status: 'ready', email: session.user.email, plan: session.user.plan })
    })

    void resolve()

    return () => {
      active = false
      unsubscribe()
    }
  }, [router, pathname, attempt])

  if (state.status === 'unavailable') {
    return (
      <FullPageMessage
        title="Can't reach TaskPilot"
        body={state.message}
        action={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setState({ status: 'checking' })
              setAttempt((n) => n + 1)
            }}
          >
            Try again
          </button>
        }
      />
    )
  }

  if (state.status === 'checking' || state.status === 'signed-out') {
    return <FullPageMessage title="Loading your workspace…" />
  }

  return <AuthProvider value={{ email: state.email, plan: state.plan }}>{children}</AuthProvider>
}

// ─── PRESENTATION ────────────────────────────────────────────

function FullPageMessage({
  title,
  body,
  action,
}: {
  title: string
  body?: string
  action?: React.ReactNode
}) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 32,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
      {body && (
        <p style={{ fontSize: 13.5, color: 'var(--foreground-secondary)', maxWidth: 460, lineHeight: 1.6 }}>
          {body}
        </p>
      )}
      {action}
    </div>
  )
}
