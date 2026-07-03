import type { Metadata } from 'next'
import { PageShell } from '../_shell'

export const metadata: Metadata = {
  title: 'Roadmap',
  description: 'Where TaskPilot is headed — shipped, in progress, and planned.',
}

interface Column {
  status: 'shipped' | 'building' | 'planned'
  title: string
  accent: string
  items: string[]
}

// Grounded in the README roadmap (v1.0 shipped, v1.1, v2.0).
const COLUMNS: Column[] = [
  {
    status: 'shipped',
    title: 'Shipped',
    accent: '#10b981',
    items: [
      'Chrome extension (Manifest V3)',
      'Smart Paste with 3-layer parsing',
      'AI Sidebar (summarize, extract, translate, rewrite)',
      'Anonymous sessions — no forced signup',
      'Semantic cache for cost reduction',
      'Stripe billing (Free + Pro)',
      'Dashboard with analytics',
    ],
  },
  {
    status: 'building',
    title: 'In progress',
    accent: '#22d3ee',
    items: [
      'HubSpot CRM integration',
      'Workflow builder UI',
      'Browser action recording',
      'Firefox extension',
    ],
  },
  {
    status: 'planned',
    title: 'Planned',
    accent: '#818cf8',
    items: [
      'Salesforce + Notion integrations',
      'Team workspaces',
      'AI workflow automation',
      'Custom / fine-tuned models',
      'Enterprise SSO',
    ],
  },
]

export default function RoadmapPage() {
  return (
    <PageShell
      eyebrow="Product"
      title="Roadmap"
      subtitle="What we’ve shipped, what we’re building now, and what’s coming. Priorities shift with your feedback."
      maxWidth={980}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 20,
        }}
      >
        {COLUMNS.map((col) => (
          <div
            key={col.status}
            className="glass"
            style={{
              borderRadius: 16,
              padding: 20,
              border: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 16,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: col.accent,
                }}
              />
              <h2
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: 15,
                  fontWeight: 700,
                  color: 'var(--foreground)',
                  margin: 0,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {col.title}
              </h2>
            </div>
            <ul style={{ display: 'grid', gap: 10, listStyle: 'none', padding: 0, margin: 0 }}>
              {col.items.map((item) => (
                <li
                  key={item}
                  style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-start',
                    fontSize: 14,
                    lineHeight: 1.55,
                    color: 'var(--foreground-secondary)',
                  }}
                >
                  <span style={{ color: col.accent, flexShrink: 0 }}>
                    {col.status === 'shipped' ? '✓' : '○'}
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 48,
          padding: 20,
          borderRadius: 12,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          fontSize: 14,
          color: 'var(--foreground-secondary)',
          lineHeight: 1.6,
        }}
      >
        Have something you&apos;d love to see? Tell us at{' '}
        <a href="mailto:hello@taskpilot.cc" style={{ color: 'var(--indigo-light)' }}>
          hello@taskpilot.cc
        </a>
        . This roadmap is directional, not a commitment to dates.
      </div>
    </PageShell>
  )
}
