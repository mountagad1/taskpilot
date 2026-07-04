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

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  )
}

function SignupForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClientComponentClient()
  const plan = searchParams.get('plan')

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkEmail, setCheckEmail] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    })

    setLoading(false)

    if (signUpError) {
      setError(signUpError.message)
      return
    }

    if (data.session) {
      router.push(plan ? `/dashboard?plan=${plan}` : '/dashboard')
      router.refresh()
      return
    }

    setCheckEmail(true)
  }

  if (checkEmail) {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>✉️</div>
        <h1
          style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: 800,
            fontSize: 22,
            marginBottom: 8,
            color: 'var(--foreground)',
          }}
        >
          Check your inbox
        </h1>
        <p style={{ fontSize: 14, color: 'var(--foreground-secondary)' }}>
          We sent a confirmation link to <strong>{email}</strong>. Click it to activate
          your account and get started.
        </p>
      </div>
    )
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
        Create your account
      </h1>
      <p style={{ fontSize: 14, color: 'var(--foreground-secondary)', marginBottom: 24 }}>
        {plan ? `Start your ${plan} plan — free to try.` : 'Free to start, no credit card required.'}
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label htmlFor="name" style={labelStyle}>Full name</label>
          <input
            id="name"
            type="text"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
            placeholder="Jane Doe"
          />
        </div>

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
          <label htmlFor="password" style={labelStyle}>Password</label>
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
          {loading ? 'Creating account…' : 'Create account'}
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
        Already have an account?{' '}
        <Link href="/auth/login" style={{ color: 'var(--indigo-light)', textDecoration: 'none' }}>
          Sign in
        </Link>
      </p>
    </>
  )
}
