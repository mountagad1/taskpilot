import type { Metadata } from 'next'
import { PageShell } from '../_shell'

export const metadata: Metadata = {
  title: 'Careers',
  description: 'Help build the AI operating layer for the browser. Open roles at TaskPilot.',
}

const VALUES = [
  { title: 'Small team, real ownership', body: 'You’ll own meaningful surface area from day one, not a sliver of a sliver.' },
  { title: 'Ship, then refine', body: 'We get things in front of users quickly and improve with real feedback.' },
  { title: 'Users over vanity', body: 'We’d rather earn trust with honest, working software than fake polish.' },
]

export default function CareersPage() {
  return (
    <PageShell
      eyebrow="Company"
      title="Build the AI layer for the browser"
      subtitle="We’re a small team turning every webpage into an intelligent workspace. When we’re hiring, roles land here."
    >
      {/* Honest empty state — no phantom job listings */}
      <div
        className="glass"
        style={{
          borderRadius: 16,
          border: '1px solid var(--border)',
          padding: '48px 24px',
          textAlign: 'center',
          marginBottom: 48,
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
          🚀
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
          No open roles right now
        </h2>
        <p
          style={{
            fontSize: 15,
            lineHeight: 1.7,
            color: 'var(--foreground-secondary)',
            maxWidth: 460,
            margin: '0 auto 24px',
          }}
        >
          We aren&apos;t actively hiring at the moment, but we&apos;re always glad to meet
          people who love building thoughtful tools. If that&apos;s you, send a note and tell
          us what you&apos;d want to work on.
        </p>
        <a
          href="mailto:careers@taskpilot.cc?subject=Introduction"
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
          Introduce yourself
        </a>
      </div>

      {/* What it's like */}
      <h2
        style={{
          fontFamily: 'var(--font-heading)',
          fontSize: 20,
          fontWeight: 700,
          color: 'var(--foreground)',
          marginBottom: 16,
        }}
      >
        How we work
      </h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        {VALUES.map((v) => (
          <div
            key={v.title}
            className="glass"
            style={{ borderRadius: 14, padding: 20, border: '1px solid var(--border)' }}
          >
            <h3
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: 15,
                fontWeight: 700,
                color: 'var(--foreground)',
                marginBottom: 8,
              }}
            >
              {v.title}
            </h3>
            <p style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--foreground-secondary)', margin: 0 }}>
              {v.body}
            </p>
          </div>
        ))}
      </div>
    </PageShell>
  )
}
