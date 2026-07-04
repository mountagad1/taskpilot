'use client'

import { Suspense, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

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

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClientComponentClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const redirectTo = searchParams.get('redirect') || '/dashboard'

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    setLoading(false)

    if (signInError) {
      setError(signInError.message)
      return
    }

    router.push(redirectTo)
    router.refresh()
  }

  return (
    <>
      <h1
        style={{
          fontFamily: 'var(--font-heading)',
          fontWeight: 800,
          fontSize: 24,
          marginBottom: 6,
          color: 'var(--foreground)',
        }}
      >
        Welcome back
      </h1>
      <p style={{ fontSize: 14, color: 'var(--foreground-secondary)', marginBottom: 24 }}>
        Sign in to continue to TaskPilot.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label htmlFor="email" style={labelStyle}>Email</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            placeholder="you@company.com"
          />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <label htmlFor="password" style={labelStyle}>Password</label>
            <Link
              href="/auth/reset-password"
              style={{ fontSize: 12, color: 'var(--indigo-light)', textDecoration: 'none' }}
            >
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
            placeholder="••••••••"
          />
        </div>

        {error && (
          <p
            role="alert"
            style={{
              fontSize: 13,
              color: '#f87171',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 'var(--radius-md)',
              padding: '8px 12px',
            }}
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center', opacity: loading ? 0.7 : 1 }}
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p
        style={{
          marginTop: 20,
          textAlign: 'center',
          fontSize: 13,
          color: 'var(--foreground-tertiary)',
        }}
      >
        Don&apos;t have an account?{' '}
        <Link href="/auth/signup" style={{ color: 'var(--indigo-light)', textDecoration: 'none' }}>
          Sign up
        </Link>
      </p>
    </>
  )
}
