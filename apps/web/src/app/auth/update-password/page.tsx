'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
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

export default function UpdatePasswordPage() {
  const router = useRouter()
  const supabase = createClientComponentClient()

  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setDone(true)
    setTimeout(() => {
      router.push('/dashboard')
      router.refresh()
    }, 1500)
  }

  if (done) {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
        <h1
          style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: 700,
            fontSize: 22,
            marginBottom: 8,
            color: 'var(--foreground)',
          }}
        >
          Password updated
        </h1>
        <p style={{ fontSize: 14, color: 'var(--foreground-secondary)' }}>
          Taking you to your dashboard…
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
        Set a new password
      </h1>
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
          {loading ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </>
  )
}
