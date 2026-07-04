import Link from 'next/link'
import type { ReactNode } from 'react'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--background)',
        color: 'var(--foreground)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        position: 'relative',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: '-10%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 600,
          height: 600,
          background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <Link
        href="/"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          textDecoration: 'none',
          fontFamily: 'var(--font-heading)',
          fontWeight: 700,
          fontSize: 18,
          color: 'var(--foreground)',
          marginBottom: 32,
          position: 'relative',
        }}
      >
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: 'var(--gradient-brand)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 14,
          }}
        >
          ✦
        </span>
        TaskPilot
      </Link>

      <div
        className="glass"
        style={{
          width: '100%',
          maxWidth: 400,
          borderRadius: 'var(--radius-xl)',
          padding: '32px',
          position: 'relative',
        }}
      >
        {children}
      </div>

      <p
        style={{
          marginTop: 24,
          fontSize: 13,
          color: 'var(--foreground-tertiary)',
          position: 'relative',
        }}
      >
        <Link href="/privacy" style={{ color: 'inherit' }}>Privacy</Link>
        {' · '}
        <Link href="/terms" style={{ color: 'inherit' }}>Terms</Link>
      </p>
    </div>
  )
}
