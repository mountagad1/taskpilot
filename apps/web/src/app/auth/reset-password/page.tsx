'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
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

export default function ResetPasswordPage() {
  const supabase = createClientComponentClient()

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/update-password`,
    })

    setLoading(false)

    if (resetError) {
      setError(resetError.message)
      return
    }

    setSent(true)
  }

  if (sent) {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>✉️</div>
        <h1
          style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: 700,
            fontSize: 22,
            marginBottom: 8,
            color: 'var(--foreground)',
          }}
        >
          Check your inbox
        </h1>
        <p style={{ fontSize: 14, color: 'var(--foreground-secondary)' }}>
          If an account exists for <strong>{email}</strong>, we sent a link to reset your
          password.
        </p>
      </div>
    )
  }

  return (
    <>
      <h1
        style={{
          fontFamily: 'var(--font-heading)',
          fontWeight: 700,
          fontSize: 24,
          marginBottom: 6,
          color: 'var(--foreground)',
        }}
      >
        Reset your password
      </h1>
      <p style={{ fontSize: 14, color: 'var(--foreground-secondary)', marginBottom: 24 }}>
        Enter your email and we&apos;ll send you a reset link.
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
          {loading ? 'Sending…' : 'Send reset link'}
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
        <Link href="/auth/login" style={{ color: 'var(--indigo-light)', textDecoration: 'none' }}>
          Back to sign in
        </Link>
      </p>
    </>
  )
}
