'use client'

/**
 * Browser Actions — dashboard product page.
 *
 * Actions are reusable automations (extract emails, scrape a table,
 * push leads to a CRM). They EXECUTE inside the browser extension;
 * this dashboard is where you browse the library and review run
 * history. Saved actions load from the `workflows` Supabase table.
 *
 * When a user has no saved actions yet, we show a labelled set of
 * example templates rather than pretending they already have runs.
 */

import { useState, useEffect, useCallback } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { EmptyState, ErrorState, SkeletonList, DemoBanner } from '@/components/states'

interface ActionRow {
  id: string
  name: string
  description: string | null
  trigger: string | null
  steps_count?: number
  last_run_at?: string | null
  runs?: number
  status?: 'active' | 'paused'
  created_at?: string
  isTemplate?: boolean
}

const TEMPLATES: ActionRow[] = [
  {
    id: 'tpl-emails',
    name: 'Extract all emails',
    description: 'Scan the current page and collect every email address into a list.',
    trigger: 'Manual · Alt+E',
    steps_count: 2,
    runs: 0,
    status: 'active',
    isTemplate: true,
  },
  {
    id: 'tpl-table',
    name: 'Scrape visible table',
    description: 'Turn the first HTML table on the page into structured rows, ready to export.',
    trigger: 'Manual',
    steps_count: 3,
    runs: 0,
    status: 'active',
    isTemplate: true,
  },
  {
    id: 'tpl-leads',
    name: 'Capture LinkedIn lead',
    description: 'Parse a profile into first/last name, title, company and push to your CRM.',
    trigger: 'Manual · on linkedin.com',
    steps_count: 4,
    runs: 0,
    status: 'active',
    isTemplate: true,
  },
  {
    id: 'tpl-prices',
    name: 'Collect product prices',
    description: 'Extract product names and prices from a store or listing page.',
    trigger: 'Manual · on shopping sites',
    steps_count: 3,
    runs: 0,
    status: 'paused',
    isTemplate: true,
  },
]

type Tab = 'library' | 'history'

function relativeTime(iso?: string | null): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function BrowserActionsPage() {
  const supabase = createClientComponentClient()
  const [tab, setTab] = useState<Tab>('library')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actions, setActions] = useState<ActionRow[]>([])
  const [usingTemplates, setUsingTemplates] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        // Not signed in — show templates so the page is still useful.
        setActions(TEMPLATES)
        setUsingTemplates(true)
        return
      }

      const { data, error: dbError } = await supabase
        .from('workflows')
        .select('id, name, description, trigger_type, steps, last_run_at, run_count, is_active, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (dbError) throw new Error(dbError.message)

      if (!data || data.length === 0) {
        setActions(TEMPLATES)
        setUsingTemplates(true)
      } else {
        setActions(
          data.map((w: Record<string, unknown>) => ({
            id: String(w.id),
            name: String(w.name),
            description: (w.description as string) ?? null,
            trigger: (w.trigger_type as string) ?? 'Manual',
            steps_count: Array.isArray(w.steps) ? w.steps.length : undefined,
            last_run_at: (w.last_run_at as string) ?? null,
            runs: (w.run_count as number) ?? 0,
            status: w.is_active === false ? 'paused' : 'active',
            created_at: (w.created_at as string) ?? undefined,
          })),
        )
        setUsingTemplates(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your actions.')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    load()
  }, [load])

  const ranActions = actions.filter((a) => (a.runs ?? 0) > 0)

  return (
    <div className="p-8 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">
            Browser Actions
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--foreground-secondary)' }}>
            Reusable automations that run inside the extension. Build them here,
            trigger them on any page.
          </p>
        </div>
        <button
          className="px-4 py-2 rounded-lg text-sm font-heading font-semibold transition-all"
          style={{ background: 'var(--gradient-brand)', color: '#fff' }}
        >
          + New action
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 glass rounded-lg p-1 w-fit">
        {(['library', 'history'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-1.5 rounded-md text-xs font-heading font-semibold capitalize transition-all"
            style={{
              background: tab === t ? 'var(--surface-active)' : 'transparent',
              color: tab === t ? 'var(--foreground)' : 'var(--foreground-tertiary)',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {usingTemplates && !loading && !error && (
        <DemoBanner>
          These are starter templates. Save or run one from the extension and
          your own actions and run history will appear here.
        </DemoBanner>
      )}

      {/* Content */}
      {loading && <SkeletonList rows={4} />}

      {!loading && error && <ErrorState message={error} onRetry={load} />}

      {!loading && !error && tab === 'library' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {actions.map((a) => (
            <div key={a.id} className="glass rounded-xl p-5 flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className="flex items-center justify-center shrink-0"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 9,
                      background: 'var(--surface-hover)',
                      fontSize: 16,
                    }}
                    aria-hidden
                  >
                    ⚙
                  </div>
                  <div>
                    <h3
                      className="font-heading font-semibold text-sm"
                      style={{ color: 'var(--foreground)' }}
                    >
                      {a.name}
                    </h3>
                    <p
                      className="text-xs font-mono mt-0.5"
                      style={{ color: 'var(--foreground-tertiary)' }}
                    >
                      {a.trigger}
                    </p>
                  </div>
                </div>
                <span
                  className="text-xs px-2 py-0.5 rounded-full shrink-0"
                  style={{
                    background:
                      a.status === 'active'
                        ? 'rgba(16,185,129,0.12)'
                        : 'var(--surface-hover)',
                    color: a.status === 'active' ? '#10b981' : 'var(--foreground-tertiary)',
                  }}
                >
                  {a.status}
                </span>
              </div>

              <p
                className="text-sm mt-3 flex-1"
                style={{ color: 'var(--foreground-secondary)' }}
              >
                {a.description}
              </p>

              <div
                className="flex items-center gap-4 mt-4 pt-3 border-t text-xs"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--foreground-tertiary)' }}
              >
                {typeof a.steps_count === 'number' && <span>{a.steps_count} steps</span>}
                <span>{a.runs ?? 0} runs</span>
                <span>last run {relativeTime(a.last_run_at)}</span>
                <button
                  className="ml-auto text-xs font-heading font-semibold"
                  style={{ color: 'var(--indigo-light)' }}
                >
                  Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !error && tab === 'history' && (
        <>
          {ranActions.length === 0 ? (
            <EmptyState
              icon="↻"
              title="No runs yet"
              description="Once you run an action from the extension, each execution — with its status, duration, and output — will show up here."
            />
          ) : (
            <div className="glass rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Action', 'Trigger', 'Runs', 'Last run', 'Status'].map((h) => (
                      <th
                        key={h}
                        className="px-5 py-3 text-left text-xs font-heading font-semibold"
                        style={{ color: 'var(--foreground-tertiary)' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ranActions.map((a, i) => (
                    <tr
                      key={a.id}
                      style={{
                        borderBottom:
                          i < ranActions.length - 1
                            ? '1px solid var(--border-subtle)'
                            : 'none',
                      }}
                    >
                      <td className="px-5 py-3 font-heading font-semibold text-foreground">{a.name}</td>
                      <td className="px-5 py-3 font-mono" style={{ color: 'var(--foreground-tertiary)' }}>
                        {a.trigger}
                      </td>
                      <td className="px-5 py-3 font-mono text-foreground">{a.runs}</td>
                      <td className="px-5 py-3 font-mono" style={{ color: 'var(--foreground-secondary)' }}>
                        {relativeTime(a.last_run_at)}
                      </td>
                      <td className="px-5 py-3">
                        <span style={{ color: a.status === 'active' ? '#10b981' : 'var(--foreground-tertiary)' }}>
                          {a.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
