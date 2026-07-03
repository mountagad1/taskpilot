import type { Metadata } from 'next'
import { PageShell } from '../_shell'

export const metadata: Metadata = {
  title: 'Changelog',
  description: 'What’s new in TaskPilot — releases, improvements, and fixes.',
}

interface Release {
  version: string
  date: string
  tag?: 'latest' | 'major'
  changes: { type: 'new' | 'improved' | 'fixed'; text: string }[]
}

// Grounded in the shipped v1.0 feature set. Update as you release.
const RELEASES: Release[] = [
  {
    version: '1.0.0',
    date: 'January 2026',
    tag: 'latest',
    changes: [
      { type: 'new', text: 'Smart Paste — turn clipboard text into autofilled form fields with 3-layer regex → heuristic → AI parsing.' },
      { type: 'new', text: 'Universal AI Sidebar — summarize, translate, rewrite, and extract data on any page.' },
      { type: 'new', text: 'Chrome extension (Manifest V3) with Shadow DOM isolation and keyboard shortcuts.' },
      { type: 'new', text: 'Anonymous sessions — use core features with no forced signup.' },
      { type: 'new', text: 'Dashboard with usage analytics and productivity metrics.' },
      { type: 'new', text: 'Stripe billing for Free and Pro plans.' },
      { type: 'improved', text: 'Semantic caching cuts AI cost by routing repeat requests to cached results.' },
    ],
  },
]

const TYPE_STYLES: Record<string, { label: string; bg: string; fg: string }> = {
  new: { label: 'New', bg: 'rgba(99,102,241,0.14)', fg: '#818cf8' },
  improved: { label: 'Improved', bg: 'rgba(34,211,238,0.14)', fg: '#22d3ee' },
  fixed: { label: 'Fixed', bg: 'rgba(16,185,129,0.14)', fg: '#10b981' },
}

export default function ChangelogPage() {
  return (
    <PageShell
      eyebrow="Product"
      title="Changelog"
      subtitle="Every release, improvement, and fix. Building in the open."
    >
      <div style={{ display: 'grid', gap: 48 }}>
        {RELEASES.map((release) => (
          <div key={release.version}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginBottom: 20,
                flexWrap: 'wrap',
              }}
            >
              <h2
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: 24,
                  fontWeight: 800,
                  color: 'var(--foreground)',
                  margin: 0,
                }}
              >
                v{release.version}
              </h2>
              {release.tag === 'latest' && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '3px 10px',
                    borderRadius: 999,
                    background: 'var(--gradient-brand)',
                    color: '#fff',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Latest
                </span>
              )}
              <span style={{ color: 'var(--foreground-tertiary)', fontSize: 14 }}>
                {release.date}
              </span>
            </div>

            <ul style={{ display: 'grid', gap: 12, listStyle: 'none', padding: 0, margin: 0 }}>
              {release.changes.map((c, i) => {
                const s = TYPE_STYLES[c.type]
                return (
                  <li
                    key={i}
                    style={{
                      display: 'flex',
                      gap: 12,
                      alignItems: 'flex-start',
                      fontSize: 15,
                      lineHeight: 1.6,
                      color: 'var(--foreground-secondary)',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 6,
                        background: s.bg,
                        color: s.fg,
                        flexShrink: 0,
                        marginTop: 2,
                        minWidth: 62,
                        textAlign: 'center',
                      }}
                    >
                      {s.label}
                    </span>
                    {c.text}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 56,
          padding: 20,
          borderRadius: 12,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          fontSize: 14,
          color: 'var(--foreground-secondary)',
        }}
      >
        Want to know what&apos;s next? See the{' '}
        <a href="/roadmap" style={{ color: 'var(--indigo-light)' }}>
          roadmap
        </a>
        .
      </div>
    </PageShell>
  )
}
