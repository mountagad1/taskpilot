'use client'

// ============================================================
// TASKPILOT — DASHBOARD OVERVIEW
// apps/web/src/app/dashboard/page.tsx
//
// A real snapshot: recent runs, this month's usage against the plan
// allowance, and the next useful action. No placeholder numbers — an empty
// account says so plainly and points at how to get started.
// ============================================================

import Link from 'next/link'

import { useApi, useApiList } from '@/lib/client/api'
import { ErrorState, SkeletonCard, SkeletonList } from '@/components/states'
import { IconBot, IconZap, IconWorkflow, IconStar, IconArrowRight } from '@/components/ui/icons'

interface Analytics {
  totals: {
    runs: number
    completed: number
    failed: number
    success_rate: number | null
    tokens: number
    cost_usd: number
    median_duration_ms: number | null
  }
  published: { agents: number; installs: number; sales: number; gross_cents: number }
}

interface RunRow {
  id: string
  goal: string
  status: string
  domain: string | null
  steps_completed: number
  steps_total: number
  started_at: string
}

const NEXT_STEPS = [
  {
    href: '/dashboard/agents',
    icon: <IconZap size={16} />,
    title: 'Build an agent',
    body: 'Package a repeated browser task once and run it from anywhere.',
  },
  {
    href: '/marketplace',
    icon: <IconStar size={16} />,
    title: 'Install a ready-made agent',
    body: 'Free and paid agents for CRMs, storefronts, inboxes and research.',
  },
  {
    href: '/dashboard/workflows',
    icon: <IconWorkflow size={16} />,
    title: 'Automate on a schedule',
    body: 'Chain steps into a workflow and let it run without you.',
  },
]

export default function DashboardPage() {
  const analytics = useApi<Analytics>('/v1/analytics?days=30')
  const runs = useApiList<RunRow>('/v1/runs?per_page=6')

  return (
    <div style={{ padding: 28, maxWidth: 960 }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Overview</h1>
        <p style={{ fontSize: 14, color: 'var(--foreground-secondary)', marginTop: 4 }}>
          The last 30 days of automation across your browser.
        </p>
      </header>

      {analytics.loading ? (
        <SkeletonCard />
      ) : analytics.error ? (
        <ErrorState message={analytics.error} onRetry={analytics.reload} />
      ) : analytics.data ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))',
            gap: 12,
            marginBottom: 26,
          }}
        >
          <Stat label="Runs" value={analytics.data.totals.runs.toLocaleString()} />
          <Stat
            label="Success rate"
            value={
              analytics.data.totals.success_rate === null ? '—' : `${analytics.data.totals.success_rate}%`
            }
          />
          <Stat
            label="Median duration"
            value={
              analytics.data.totals.median_duration_ms
                ? formatDuration(analytics.data.totals.median_duration_ms)
                : '—'
            }
          />
          <Stat label="AI cost" value={`$${analytics.data.totals.cost_usd.toFixed(4)}`} />
        </div>
      ) : null}

      <section style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600 }}>Recent runs</h2>
          <Link
            href="/dashboard/runs"
            style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--indigo-light)', textDecoration: 'none' }}
          >
            View all →
          </Link>
        </div>

        {runs.loading ? (
          <SkeletonList rows={3} />
        ) : runs.error ? (
          <ErrorState message={runs.error} onRetry={runs.reload} />
        ) : runs.items.length === 0 ? (
          <div className="ui-card" style={{ padding: 28, textAlign: 'center' }}>
            <div style={{ color: 'var(--foreground-tertiary)', marginBottom: 10 }}>
              <IconBot size={24} />
            </div>
            <div style={{ fontWeight: 600, marginBottom: 5 }}>Nothing has run yet</div>
            <p style={{ fontSize: 13, color: 'var(--foreground-secondary)', maxWidth: 400, margin: '0 auto' }}>
              Install the browser extension, open any page, and press{' '}
              <kbd style={kbdStyle}>Alt</kbd>+<kbd style={kbdStyle}>K</kbd> to tell TaskPilot what to do.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {runs.items.map((run) => (
              <Link
                key={run.id}
                href="/dashboard/runs"
                className="ui-card"
                style={{
                  padding: '11px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 11,
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    flex: 'none',
                    background: statusColour(run.status),
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 13.5,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {run.goal}
                </span>
                {run.domain && (
                  <span style={{ fontSize: 11.5, color: 'var(--foreground-muted)' }}>{run.domain}</span>
                )}
                <span style={{ fontSize: 11.5, color: 'var(--foreground-muted)', flex: 'none' }}>
                  {formatRelative(run.started_at)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {analytics.data && analytics.data.published.agents > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Your published agents</h2>
          <div className="ui-card" style={{ padding: 18, display: 'flex', gap: 26, flexWrap: 'wrap' }}>
            <Mini label="Published" value={analytics.data.published.agents} />
            <Mini label="Installs" value={analytics.data.published.installs} />
            <Mini label="Sales" value={analytics.data.published.sales} />
            <Mini label="Gross" value={`$${(analytics.data.published.gross_cents / 100).toFixed(2)}`} />
            <Link
              href="/dashboard/marketplace"
              style={{
                marginLeft: 'auto',
                alignSelf: 'center',
                fontSize: 12.5,
                color: 'var(--indigo-light)',
                textDecoration: 'none',
              }}
            >
              Manage listings →
            </Link>
          </div>
        </section>
      )}

      <section>
        <h2 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>What next</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 12 }}>
          {NEXT_STEPS.map((step) => (
            <Link
              key={step.href}
              href={step.href}
              className="ui-card"
              style={{ padding: 16, textDecoration: 'none', color: 'inherit', display: 'block' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7 }}>
                <span style={{ color: 'var(--indigo-light)', display: 'flex' }}>{step.icon}</span>
                <span style={{ fontWeight: 600, fontSize: 13.5 }}>{step.title}</span>
                <span style={{ marginLeft: 'auto', color: 'var(--foreground-tertiary)', display: 'flex' }}>
                  <IconArrowRight size={13} />
                </span>
              </div>
              <p style={{ fontSize: 12.5, color: 'var(--foreground-secondary)', lineHeight: 1.55 }}>
                {step.body}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}

// ─── PRIMITIVES ──────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="ui-card" style={{ padding: 16 }}>
      <div
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--foreground-muted)',
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 23, fontWeight: 600, marginTop: 5 }}>{value}</div>
    </div>
  )
}

function Mini({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10.5,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'var(--foreground-muted)',
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 17, fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  )
}

const kbdStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono, monospace)',
  fontSize: 11,
  padding: '1px 5px',
  borderRadius: 4,
  border: '1px solid var(--border-subtle)',
  background: 'var(--surface)',
}

function statusColour(status: string): string {
  const colours: Record<string, string> = {
    completed: '#22c55e',
    failed: '#ef4444',
    running: '#6366f1',
    planning: '#818cf8',
    awaiting_confirmation: '#f59e0b',
    cancelled: '#64748b',
    timed_out: '#f97316',
  }
  return colours[status] ?? '#94a3b8'
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
}

function formatRelative(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime()
  if (delta < 60_000) return 'just now'
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`
  if (delta < 604_800_000) return `${Math.floor(delta / 86_400_000)}d ago`
  return new Date(iso).toLocaleDateString()
}
