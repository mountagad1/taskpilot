'use client'

// ============================================================
// TASKPILOT — ANALYTICS
// apps/web/src/app/dashboard/analytics/page.tsx
//
// Real usage derived from run history: throughput, success rate, latency and
// AI cost, plus how any published agents are performing.
// ============================================================

import { useState } from 'react'
import Link from 'next/link'

import { useApi } from '@/lib/client/api'
import { ErrorState, SkeletonCard } from '@/components/states'
import { IconChart } from '@/components/ui/icons'

interface Analytics {
  period_days: number
  totals: {
    runs: number
    completed: number
    failed: number
    success_rate: number | null
    tokens: number
    cost_usd: number
    avg_duration_ms: number | null
    median_duration_ms: number | null
  }
  daily: Array<{ date: string; runs: number; completed: number; failed: number; cost_usd: number }>
  top_domains: Array<{ name: string; count: number }>
  published: {
    agents: number
    installs: number
    runs: number
    sales: number
    gross_cents: number
    top: Array<{ id: string; name: string; slug: string; run_count: number; install_count: number }>
  }
}

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
]

export default function AnalyticsPage() {
  const [days, setDays] = useState(30)
  const { data, loading, error, reload } = useApi<Analytics>(`/v1/analytics?days=${days}`, [days])

  return (
    <div style={{ padding: 28, maxWidth: 960 }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Analytics</h1>
          <p style={{ fontSize: 14, color: 'var(--foreground-secondary)', marginTop: 4 }}>
            What TaskPilot actually ran for you, and what it cost.
          </p>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 5, marginRight: 46 }}>
          {RANGES.map((range) => (
            <button
              key={range.days}
              onClick={() => setDays(range.days)}
              style={{
                padding: '5px 12px',
                borderRadius: 8,
                fontSize: 12.5,
                cursor: 'pointer',
                border: `1px solid ${days === range.days ? 'rgba(99,102,241,0.45)' : 'var(--border-subtle)'}`,
                background: days === range.days ? 'rgba(99,102,241,0.15)' : 'var(--surface)',
                color: days === range.days ? 'var(--indigo-light)' : 'var(--foreground-secondary)',
              }}
            >
              {range.label}
            </button>
          ))}
        </div>
      </header>

      {loading ? (
        <div style={{ display: 'grid', gap: 13 }}>
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? null : data.totals.runs === 0 ? (
        <div className="ui-card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ color: 'var(--foreground-tertiary)', marginBottom: 12 }}>
            <IconChart size={26} />
          </div>
          <div style={{ fontWeight: 600, marginBottom: 5 }}>No runs in this period</div>
          <p style={{ fontSize: 13, color: 'var(--foreground-secondary)', maxWidth: 380, margin: '0 auto' }}>
            Open the extension on any page and tell TaskPilot what to do. Usage appears here as soon
            as the first run finishes.
          </p>
        </div>
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))',
              gap: 12,
              marginBottom: 22,
            }}
          >
            <Stat label="Runs" value={data.totals.runs.toLocaleString()} />
            <Stat
              label="Success rate"
              value={data.totals.success_rate === null ? '—' : `${data.totals.success_rate}%`}
              tone={successTone(data.totals.success_rate)}
            />
            <Stat
              label="Median duration"
              value={data.totals.median_duration_ms ? formatDuration(data.totals.median_duration_ms) : '—'}
              hint={data.totals.avg_duration_ms ? `mean ${formatDuration(data.totals.avg_duration_ms)}` : undefined}
            />
            <Stat label="Tokens" value={compact(data.totals.tokens)} />
            <Stat label="AI cost" value={`$${data.totals.cost_usd.toFixed(4)}`} />
          </div>

          <section className="ui-card" style={{ padding: 20, marginBottom: 22 }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Daily activity</h2>
            <ActivityChart daily={data.daily} />
          </section>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 14 }}>
            <section className="ui-card" style={{ padding: 20 }}>
              <h2 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Busiest sites</h2>

              {data.top_domains.length === 0 ? (
                <p style={{ fontSize: 12.5, color: 'var(--foreground-muted)' }}>No sites recorded yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.top_domains.map((domain) => (
                    <div key={domain.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span
                        style={{
                          fontSize: 12.5,
                          minWidth: 0,
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {domain.name}
                      </span>
                      <div
                        style={{
                          width: 100,
                          height: 5,
                          borderRadius: 3,
                          background: 'rgba(255,255,255,0.07)',
                          overflow: 'hidden',
                          flex: 'none',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${(domain.count / data.top_domains[0].count) * 100}%`,
                            background: 'linear-gradient(90deg,#6366f1,#a855f7)',
                          }}
                        />
                      </div>
                      <span
                        style={{ fontSize: 11.5, color: 'var(--foreground-muted)', width: 30, textAlign: 'right' }}
                      >
                        {domain.count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="ui-card" style={{ padding: 20 }}>
              <h2 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Your published agents</h2>

              {data.published.agents === 0 ? (
                <p style={{ fontSize: 12.5, color: 'var(--foreground-secondary)' }}>
                  You have not published an agent yet.{' '}
                  <Link href="/dashboard/agents" style={{ color: 'var(--indigo-light)', textDecoration: 'none' }}>
                    Build one →
                  </Link>
                </p>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 18, marginBottom: 13 }}>
                    <Mini label="Installs" value={data.published.installs} />
                    <Mini label="Runs" value={data.published.runs} />
                    <Mini label="Sales" value={data.published.sales} />
                    <Mini label="Gross" value={`$${(data.published.gross_cents / 100).toFixed(2)}`} />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {data.published.top.map((agent) => (
                      <Link
                        key={agent.id}
                        href={`/marketplace/${agent.slug}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          fontSize: 12.5,
                          textDecoration: 'none',
                          color: 'inherit',
                          padding: '6px 9px',
                          borderRadius: 7,
                          background: 'var(--surface)',
                        }}
                      >
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {agent.name}
                        </span>
                        <span style={{ color: 'var(--foreground-muted)', fontSize: 11.5 }}>
                          {agent.run_count} runs
                        </span>
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}

// ─── CHART ───────────────────────────────────────────────────

function ActivityChart({ daily }: { daily: Analytics['daily'] }) {
  const peak = Math.max(...daily.map((d) => d.runs), 1)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 130 }}>
        {daily.map((day) => {
          const total = (day.runs / peak) * 100
          const failedPortion = (day.failed / peak) * 100

          return (
            <div
              key={day.date}
              title={`${day.date}: ${day.runs} runs (${day.completed} completed, ${day.failed} failed)`}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                height: '100%',
              }}
            >
              {/* Failures stack above successes so a bad day is obvious at a glance. */}
              {day.failed > 0 && (
                <div
                  style={{
                    height: `${failedPortion}%`,
                    background: '#ef4444',
                    borderRadius: '3px 3px 0 0',
                    minHeight: 2,
                  }}
                />
              )}
              <div
                style={{
                  height: `${Math.max(total - failedPortion, 0)}%`,
                  background: day.runs
                    ? 'linear-gradient(180deg,#818cf8,#6366f1)'
                    : 'rgba(255,255,255,0.05)',
                  borderRadius: day.failed > 0 ? '0 0 3px 3px' : 3,
                  minHeight: day.runs ? 2 : 1,
                }}
              />
            </div>
          )
        })}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 8,
          fontSize: 11,
          color: 'var(--foreground-muted)',
        }}
      >
        <span>{formatDate(daily[0]?.date)}</span>
        <span>{formatDate(daily[daily.length - 1]?.date)}</span>
      </div>
    </div>
  )
}

// ─── PRIMITIVES ──────────────────────────────────────────────

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint?: string
  tone?: string
}) {
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
      <div style={{ fontSize: 23, fontWeight: 600, marginTop: 5, color: tone ?? 'inherit' }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: 'var(--foreground-muted)', marginTop: 3 }}>{hint}</div>}
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
      <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  )
}

// ─── FORMATTING ──────────────────────────────────────────────

function successTone(rate: number | null): string | undefined {
  if (rate === null) return undefined
  if (rate >= 90) return '#4ade80'
  if (rate >= 70) return '#fbbf24'
  return '#f87171'
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
}

function compact(value: number): string {
  if (value < 1000) return String(value)
  if (value < 1_000_000) return `${(value / 1000).toFixed(1)}k`
  return `${(value / 1_000_000).toFixed(2)}M`
}

function formatDate(iso?: string): string {
  if (!iso) return ''
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
