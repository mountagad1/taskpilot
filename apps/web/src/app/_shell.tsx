import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * Shared shell for all standalone content pages (legal, company,
 * product-info). Gives every page the same nav, container width,
 * and footer so they read as one product. Server component — no
 * client JS needed for static content.
 */
export function PageShell({
  eyebrow,
  title,
  subtitle,
  children,
  maxWidth = 760,
}: {
  eyebrow?: string
  title: string
  subtitle?: string
  children: ReactNode
  maxWidth?: number
}) {
  return (
    <div
      style={{
        background: 'var(--background)',
        color: 'var(--foreground)',
        minHeight: '100vh',
        fontFamily: 'var(--font-body)',
      }}
    >
      {/* Nav */}
      <nav
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 24px',
          background: 'rgba(7,7,17,0.8)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <Link
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            textDecoration: 'none',
            fontFamily: 'var(--font-heading)',
            fontWeight: 800,
            fontSize: 17,
            color: 'var(--foreground)',
          }}
        >
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              background: 'var(--gradient-brand)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 13,
            }}
          >
            ✦
          </span>
          TaskPilot
        </Link>
        <Link
          href="/"
          style={{
            fontSize: 13,
            color: 'var(--foreground-secondary)',
            textDecoration: 'none',
          }}
        >
          ← Back to home
        </Link>
      </nav>

      {/* Header + content */}
      <main style={{ maxWidth, margin: '0 auto', padding: '64px 24px 96px' }}>
        <header style={{ marginBottom: 48 }}>
          {eyebrow && (
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.15em',
                color: 'var(--indigo-light)',
                marginBottom: 16,
                fontFamily: 'var(--font-body)',
              }}
            >
              {eyebrow}
            </div>
          )}
          <h1
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 'clamp(34px, 5vw, 52px)',
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
              margin: 0,
              color: 'var(--foreground)',
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              style={{
                fontSize: 18,
                color: 'var(--foreground-secondary)',
                lineHeight: 1.6,
                marginTop: 16,
                maxWidth: 560,
              }}
            >
              {subtitle}
            </p>
          )}
        </header>

        <div className="prose-taskpilot">{children}</div>
      </main>

      {/* Minimal footer */}
      <footer
        style={{
          borderTop: '1px solid var(--border-subtle)',
          padding: '32px 24px',
          textAlign: 'center',
          color: 'var(--foreground-tertiary)',
          fontSize: 13,
        }}
      >
        © {new Date().getFullYear()} TaskPilot. All rights reserved.{' '}
        <Link href="/privacy" style={{ color: 'var(--foreground-tertiary)' }}>
          Privacy
        </Link>{' '}
        ·{' '}
        <Link href="/terms" style={{ color: 'var(--foreground-tertiary)' }}>
          Terms
        </Link>
      </footer>
    </div>
  )
}

/** Section heading used inside legal / content bodies. */
export function Section({
  id,
  heading,
  children,
}: {
  id?: string
  heading: string
  children: ReactNode
}) {
  return (
    <section id={id} style={{ marginBottom: 36 }}>
      <h2
        style={{
          fontFamily: 'var(--font-heading)',
          fontSize: 20,
          fontWeight: 700,
          color: 'var(--foreground)',
          marginBottom: 12,
        }}
      >
        {heading}
      </h2>
      <div
        style={{
          fontSize: 15,
          lineHeight: 1.75,
          color: 'var(--foreground-secondary)',
        }}
      >
        {children}
      </div>
    </section>
  )
}
