import type { Metadata } from 'next'
import { PageShell } from '../_shell'

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Product updates, browser-automation guides, and behind-the-scenes from TaskPilot.',
}

export default function BlogPage() {
  return (
    <PageShell
      eyebrow="Writing"
      title="The TaskPilot blog"
      subtitle="Product updates, practical browser-automation guides, and notes on building AI that acts."
    >
      {/* Honest empty state — no fabricated posts */}
      <div
        className="glass"
        style={{
          borderRadius: 16,
          border: '1px solid var(--border)',
          padding: '56px 24px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: 'var(--surface-hover)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
            margin: '0 auto 20px',
          }}
          aria-hidden
        >
          ✍️
        </div>
        <h2
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 20,
            fontWeight: 700,
            color: 'var(--foreground)',
            marginBottom: 8,
          }}
        >
          Nothing published yet
        </h2>
        <p
          style={{
            fontSize: 15,
            lineHeight: 1.7,
            color: 'var(--foreground-secondary)',
            maxWidth: 440,
            margin: '0 auto 24px',
          }}
        >
          We&apos;re heads-down building. When we publish our first posts — deep dives on the
          parsing engine, automation playbooks, and release notes — they&apos;ll show up here.
          Want them in your inbox?
        </p>
        <a
          href="mailto:hello@taskpilot.cc?subject=Notify%20me%20about%20the%20TaskPilot%20blog"
          style={{
            display: 'inline-block',
            padding: '11px 22px',
            borderRadius: 10,
            background: 'var(--gradient-brand)',
            color: '#fff',
            fontFamily: 'var(--font-heading)',
            fontWeight: 700,
            fontSize: 14,
            textDecoration: 'none',
          }}
        >
          Notify me
        </a>
      </div>

      <p
        style={{
          marginTop: 28,
          fontSize: 14,
          color: 'var(--foreground-tertiary)',
          textAlign: 'center',
        }}
      >
        In the meantime, see what we&apos;ve shipped on the{' '}
        <a href="/changelog" style={{ color: 'var(--indigo-light)' }}>
          changelog
        </a>
        .
      </p>
    </PageShell>
  )
}
