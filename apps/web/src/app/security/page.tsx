import type { Metadata } from 'next'
import { PageShell } from '../_shell'

export const metadata: Metadata = {
  title: 'Security',
  description:
    "How TaskPilot protects your data: server-side AI proxy, least-privilege permissions, encryption, and rate limiting.",
}

const PILLARS = [
  {
    icon: '🔑',
    title: 'No API keys in your browser',
    body: 'Every AI request routes through our server-side proxy. Provider keys live only on the server and are never shipped to the extension or exposed to page scripts.',
  },
  {
    icon: '🛡️',
    title: 'Least-privilege permissions',
    body: 'The extension requests only what it needs — active tab and storage. Broad host access is optional and off by default. No browsing history, no background tab access.',
  },
  {
    icon: '🧱',
    title: 'Isolation on the page',
    body: 'Our on-page UI renders inside a closed Shadow DOM, so it can’t be read or tampered with by the sites you visit, and it won’t collide with their styles.',
  },
  {
    icon: '🔒',
    title: 'Row-level security',
    body: 'Every user table in our database enforces row-level security, so one account can never read or modify another account’s rows — enforced at the database, not just the app.',
  },
  {
    icon: '⏱️',
    title: 'Rate limiting & abuse prevention',
    body: 'Per-identifier sliding-window rate limits and burst detection protect the Service and your account from abuse and runaway costs.',
  },
  {
    icon: '🌐',
    title: 'Encryption in transit',
    body: 'All traffic between the extension, our servers, and our processors is encrypted with TLS. Sessions use short-lived, ephemeral tokens.',
  },
]

const PRACTICES = [
  'Page content is processed in real time and not retained after your request completes.',
  'Local-first parsing: regex and heuristics run in your browser, so much of your data never leaves your device.',
  'Payments are handled by Stripe; we never receive or store full card numbers.',
  'Least-data collection: anonymous sessions let you use core features without an account.',
  'Full data deletion on request, with EU data-residency available for enterprise.',
]

export default function SecurityPage() {
  return (
    <PageShell
      eyebrow="Trust"
      title="Security at TaskPilot"
      subtitle="TaskPilot runs on webpages you already trust with sensitive work. Here’s how we keep that trust."
      maxWidth={900}
    >
      {/* Pillars grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 16,
          marginBottom: 48,
        }}
      >
        {PILLARS.map((p) => (
          <div
            key={p.title}
            className="glass"
            style={{
              borderRadius: 14,
              padding: 20,
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ fontSize: 22, marginBottom: 10 }} aria-hidden>
              {p.icon}
            </div>
            <h3
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: 15,
                fontWeight: 700,
                color: 'var(--foreground)',
                marginBottom: 6,
              }}
            >
              {p.title}
            </h3>
            <p
              style={{
                fontSize: 13.5,
                lineHeight: 1.65,
                color: 'var(--foreground-secondary)',
                margin: 0,
              }}
            >
              {p.body}
            </p>
          </div>
        ))}
      </div>

      {/* Practices list */}
      <h2
        style={{
          fontFamily: 'var(--font-heading)',
          fontSize: 22,
          fontWeight: 700,
          color: 'var(--foreground)',
          marginBottom: 16,
        }}
      >
        Data-handling practices
      </h2>
      <ul style={{ display: 'grid', gap: 12, paddingLeft: 0, listStyle: 'none' }}>
        {PRACTICES.map((item) => (
          <li
            key={item}
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
              fontSize: 15,
              lineHeight: 1.6,
              color: 'var(--foreground-secondary)',
            }}
          >
            <span style={{ color: 'var(--success)', flexShrink: 0, marginTop: 2 }}>✓</span>
            {item}
          </li>
        ))}
      </ul>

      {/* Disclosure */}
      <div
        className="glass"
        style={{
          marginTop: 48,
          borderRadius: 14,
          padding: 24,
          border: '1px solid var(--border)',
        }}
      >
        <h2
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--foreground)',
            marginBottom: 8,
          }}
        >
          Reporting a vulnerability
        </h2>
        <p
          style={{
            fontSize: 15,
            lineHeight: 1.7,
            color: 'var(--foreground-secondary)',
            margin: 0,
          }}
        >
          If you believe you&apos;ve found a security issue, we want to hear from you. Email{' '}
          <a href="mailto:security@taskpilot.cc" style={{ color: 'var(--indigo-light)' }}>
            security@taskpilot.cc
          </a>{' '}
          with details and steps to reproduce. Please give us a reasonable window to
          investigate and fix before public disclosure. We don&apos;t take legal action
          against good-faith research that respects our users&apos; privacy and data.
        </p>
      </div>

      <p
        style={{
          marginTop: 32,
          fontSize: 13,
          color: 'var(--foreground-tertiary)',
          lineHeight: 1.6,
        }}
      >
        Enterprise customers can request our security documentation, subprocessor list, and
        data-processing agreement at{' '}
        <a href="mailto:security@taskpilot.cc" style={{ color: 'var(--indigo-light)' }}>
          security@taskpilot.cc
        </a>
        .
      </p>
    </PageShell>
  )
}
