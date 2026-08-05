'use client'

// ============================================================
// TASKPILOT — RUN HISTORY
// apps/web/src/app/dashboard/runs/page.tsx
//
// Every agent execution, with its plan, per-step outcome, cost and errors.
// This is the page that makes the runtime debuggable rather than a black box.
// ============================================================

import { useEffect, useState } from 'react'
import type { RunStatus } from '@taskpilot/shared'

import { api, useApi, useApiList } from '@/lib/client/api'
import { EmptyState, ErrorState, SkeletonList } from '@/components/states'
import { IconBot } from '@/components/ui/icons'

interface RunRow {
  id: string
  goal: string
  status: RunStatus
  agent_id: string | null
  steps_total: number
  steps_completed: number
  tokens_used: number
  cost_usd: number
  error: string | null
  source_url: string | null
  domain: string | null
  started_at: string
  duration_ms: number | null
}

interface RunStep {
  step_index: number
  step_id: string
  action: string
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped'
  result: unknown
  error: string | null
  attempts: number
  duration_ms: number
}

const STATUS_FILTERS: Array<{ id: string; label: string }> = [
  { id: '', label: 'All' },
  { id: 'completed', label: 'Completed' },
  { id: 'failed', label: 'Failed' },
  { id: 'running', label: 'Running' },
  { id: 'awaiting_confirmation', label: 'Needs approval' },
]

export default function RunsPage() {
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  const query = status ? `?status=${status}` : ''
  const { items, loading, error, reload } = useApiList<RunRow>(`/v1/runs${query}`, [status])

  // A run in flight is executing in the browser extension, so poll while any
  // are live rather than leaving the page stale.
  const hasActive = items.some((run) => run.status === 'running' || run.status === 'planning')

  useEffect(() => {
    if (!hasActive) return
    const timer = setInterval(reload, 4000)
    return () => clearInterval(timer)
  }, [hasActive, reload])

  return (
    <div style={{ padding: 28, maxWidth: 1000 }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Runs</h1>
        <p style={{ fontSize: 14, color: 'var(--foreground-secondary)', marginTop: 4 }}>
          Every plan TaskPilot executed, step by step — including what failed and why.
        </p>
      </header>

      <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.id || 'all'}
            onClick={() => setStatus(filter.id)}
            style={{
              padding: '5px 12px',
              borderRadius: 20,
              fontSize: 12.5,
              cursor: 'pointer',
              border: `1px solid ${status === filter.id ? 'rgba(99,102,241,0.45)' : 'var(--border-subtle)'}`,
              background: status === filter.id ? 'rgba(99,102,241,0.15)' : 'var(--surface)',
              color: status === filter.id ? 'var(--indigo-light)' : 'var(--foreground-secondary)',
            }}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonList rows={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<IconBot size={22} />}
          title="No runs yet"
          description="Open the extension on any page and tell TaskPilot what to do. Runs appear here as they execute."
        />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {items.map((run) => (
            <RunRowCard
              key={run.id}
              run={run}
              expanded={selected === run.id}
              onToggle={() => setSelected(selected === run.id ? null : run.id)}
              onChanged={reload}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── ROW ─────────────────────────────────────────────────────

function RunRowCard({
  run,
  expanded,
  onToggle,
  onChanged,
}: {
  run: RunRow
  expanded: boolean
  onToggle: () => void
  onChanged: () => void
}) {
  const progress = run.steps_total ? Math.round((run.steps_completed / run.steps_total) * 100) : 0
  const isLive = run.status === 'running' || run.status === 'planning'

  return (
    <div className="ui-card" style={{ padding: 0, overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: 16,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'inherit',
          font: 'inherit',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <StatusDot status={run.status} />

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 500, fontSize: 14, wordBreak: 'break-word' }}>{run.goal}</div>

            <div
              style={{
                display: 'flex',
                gap: 14,
                marginTop: 5,
                fontSize: 11.5,
                color: 'var(--foreground-muted)',
                flexWrap: 'wrap',
              }}
            >
              <span>{formatRelative(run.started_at)}</span>
              {run.domain && <span>{run.domain}</span>}
              <span>
                {run.steps_completed}/{run.steps_total} steps
              </span>
              {run.duration_ms !== null && <span>{formatDuration(run.duration_ms)}</span>}
              {run.tokens_used > 0 && <span>{run.tokens_used.toLocaleString()} tokens</span>}
              {run.cost_usd > 0 && <span>${Number(run.cost_usd).toFixed(4)}</span>}
            </div>

            {run.steps_total > 0 && (
              <div
                style={{
                  height: 3,
                  background: 'rgba(255,255,255,0.07)',
                  borderRadius: 3,
                  marginTop: 9,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${progress}%`,
                    borderRadius: 3,
                    background:
                      run.status === 'failed'
                        ? '#ef4444'
                        : 'linear-gradient(90deg, #6366f1, #a855f7)',
                    transition: 'width 300ms ease',
                  }}
                />
              </div>
            )}

            {run.error && (
              <div style={{ marginTop: 8, fontSize: 12.5, color: '#f87171', wordBreak: 'break-word' }}>
                {run.error}
              </div>
            )}
          </div>

          <StatusLabel status={run.status} />
        </div>
      </button>

      {isLive && (
        <div style={{ padding: '0 16px 14px' }}>
          <CancelButton runId={run.id} onCancelled={onChanged} />
        </div>
      )}

      {expanded && <RunTimeline runId={run.id} />}
    </div>
  )
}

function CancelButton({ runId, onCancelled }: { runId: string; onCancelled: () => void }) {
  const [pending, setPending] = useState(false)

  return (
    <button
      className="btn btn-ghost btn-sm"
      disabled={pending}
      onClick={async () => {
        setPending(true)
        try {
          await api.post(`/v1/runs/${runId}/cancel`)
          onCancelled()
        } finally {
          setPending(false)
        }
      }}
    >
      {pending ? 'Cancelling…' : 'Cancel run'}
    </button>
  )
}

// ─── TIMELINE ────────────────────────────────────────────────

function RunTimeline({ runId }: { runId: string }) {
  const { data, loading, error } = useApi<RunRow & { steps: RunStep[]; output: Record<string, unknown> }>(
    `/v1/runs/${runId}`
  )

  if (loading) {
    return <div style={{ padding: '0 16px 16px', fontSize: 13, color: 'var(--foreground-muted)' }}>Loading…</div>
  }
  if (error) {
    return <div style={{ padding: '0 16px 16px', fontSize: 13, color: '#f87171' }}>{error}</div>
  }
  if (!data) return null

  return (
    <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border-subtle)', paddingTop: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.steps.map((step) => (
          <StepRow key={step.step_index} step={step} />
        ))}
      </div>

      {Object.keys(data.output ?? {}).length > 0 && (
        <details style={{ marginTop: 14 }}>
          <summary
            style={{
              fontSize: 12,
              color: 'var(--foreground-tertiary)',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            Output
          </summary>
          <pre
            style={{
              marginTop: 8,
              padding: 12,
              borderRadius: 8,
              background: 'var(--surface)',
              border: '1px solid var(--border-subtle)',
              fontSize: 11.5,
              overflowX: 'auto',
              maxHeight: 260,
              color: 'var(--foreground-secondary)',
            }}
          >
            {JSON.stringify(data.output, null, 2)}
          </pre>
        </details>
      )}
    </div>
  )
}

function StepRow({ step }: { step: RunStep }) {
  const [open, setOpen] = useState(false)
  const hasDetail = Boolean(step.result || step.error)

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
        padding: '8px 11px',
      }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: hasDetail ? 'pointer' : 'default' }}
        onClick={() => hasDetail && setOpen(!open)}
      >
        <StepDot status={step.status} />
        <span style={{ fontSize: 12.5, fontWeight: 500 }}>{step.action.replace(/_/g, ' ')}</span>
        <span style={{ fontSize: 11, color: 'var(--foreground-muted)' }}>#{step.step_index + 1}</span>

        {step.attempts > 1 && (
          <span style={{ fontSize: 10.5, color: '#fbbf24' }}>{step.attempts} attempts</span>
        )}

        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--foreground-muted)' }}>
          {step.duration_ms > 0 ? formatDuration(step.duration_ms) : ''}
        </span>
      </div>

      {step.error && (
        <div style={{ marginTop: 6, fontSize: 11.5, color: '#f87171', wordBreak: 'break-word' }}>
          {step.error}
        </div>
      )}

      {open && step.result != null && (
        <pre
          style={{
            marginTop: 8,
            fontSize: 11,
            color: 'var(--foreground-tertiary)',
            overflowX: 'auto',
            maxHeight: 180,
          }}
        >
          {JSON.stringify(step.result, null, 2).slice(0, 4000)}
        </pre>
      )}
    </div>
  )
}

// ─── STATUS PRIMITIVES ───────────────────────────────────────

const STATUS_COLOURS: Record<string, string> = {
  queued: '#94a3b8',
  planning: '#818cf8',
  running: '#6366f1',
  awaiting_confirmation: '#f59e0b',
  completed: '#22c55e',
  failed: '#ef4444',
  cancelled: '#64748b',
  timed_out: '#f97316',
}

function StatusDot({ status }: { status: RunStatus }) {
  const colour = STATUS_COLOURS[status] ?? '#94a3b8'
  const live = status === 'running' || status === 'planning'

  return (
    <span
      style={{
        width: 9,
        height: 9,
        borderRadius: '50%',
        background: colour,
        flex: 'none',
        marginTop: 5,
        animation: live ? 'tp-pulse 1.1s ease-in-out infinite' : undefined,
      }}
    />
  )
}

function StepDot({ status }: { status: RunStep['status'] }) {
  const colours: Record<string, string> = {
    pending: '#64748b',
    running: '#6366f1',
    succeeded: '#22c55e',
    failed: '#ef4444',
    skipped: '#f59e0b',
  }

  return (
    <span
      style={{
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: colours[status],
        flex: 'none',
      }}
    />
  )
}

function StatusLabel({ status }: { status: RunStatus }) {
  const labels: Record<string, string> = {
    queued: 'Queued',
    planning: 'Planning',
    running: 'Running',
    awaiting_confirmation: 'Needs approval',
    completed: 'Completed',
    failed: 'Failed',
    cancelled: 'Cancelled',
    timed_out: 'Timed out',
  }

  return (
    <span
      style={{
        fontSize: 11,
        padding: '3px 9px',
        borderRadius: 20,
        flex: 'none',
        background: `${STATUS_COLOURS[status] ?? '#94a3b8'}22`,
        color: STATUS_COLOURS[status] ?? '#94a3b8',
      }}
    >
      {labels[status] ?? status}
    </span>
  )
}

// ─── FORMATTING ──────────────────────────────────────────────

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
