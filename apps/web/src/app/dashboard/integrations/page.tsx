'use client'

// ============================================================
// TASKPILOT — INTEGRATIONS
// apps/web/src/app/dashboard/integrations/page.tsx
//
// The catalogue is static because it advertises providers that are not
// built yet. Connection state is not: it comes from GET /v1/integrations,
// so a card shows what is actually true for this account rather than what
// the marketing copy hopes.
//
// `id` here must match the provider slug the API accepts. The button posts
// to /v1/integrations/{id}/authorize and follows the consent URL it returns;
// the redirect back lands on this page carrying ?connected= or ?error=.
// ============================================================

import { useCallback, useEffect, useState } from 'react'

import { api, useApiList } from '@/lib/client/api'

interface CatalogueEntry {
  /** Provider slug the API knows, or null when nothing is implemented yet. */
  id: string | null
  name: string
  category: string
  icon: string
  desc: string
  plan: 'pro' | 'enterprise'
}

const INTEGRATIONS: CatalogueEntry[] = [
  {
    id: 'hubspot',
    name: 'HubSpot',
    category: 'CRM',
    icon: '🟠',
    desc: 'Push leads, contacts, and companies directly to HubSpot.',
    plan: 'pro',
  },
  {
    id: null,
    name: 'Salesforce',
    category: 'CRM',
    icon: '☁️',
    desc: 'Sync extracted data to Salesforce leads and opportunities.',
    plan: 'pro',
  },
  {
    // Listed as "available" before, but no backend provider exists — the
    // button 400s. Coming soon is the honest label.
    id: null,
    name: 'Notion',
    category: 'Productivity',
    icon: '⬛',
    desc: 'Create Notion pages from summarized content.',
    plan: 'pro',
  },
  {
    id: null,
    name: 'Airtable',
    category: 'Database',
    icon: '🟡',
    desc: 'Add extracted records directly to Airtable bases.',
    plan: 'pro',
  },
  {
    id: null,
    name: 'Slack',
    category: 'Communication',
    icon: '💬',
    desc: 'Send AI summaries and alerts to Slack channels.',
    plan: 'pro',
  },
  {
    id: null,
    name: 'Google Sheets',
    category: 'Spreadsheet',
    icon: '📊',
    desc: 'Export scraped data directly to Google Sheets.',
    plan: 'pro',
  },
  {
    id: null,
    name: 'Zapier',
    category: 'Automation',
    icon: '⚡',
    desc: 'Trigger Zaps from TaskPilot browser actions.',
    plan: 'enterprise',
  },
  {
    id: null,
    name: 'Make (Integromat)',
    category: 'Automation',
    icon: '🔵',
    desc: 'Connect TaskPilot events to 1,000+ apps via Make.',
    plan: 'enterprise',
  },
]

const PLAN_COLOR: Record<string, string> = {
  pro: 'var(--indigo-light)',
  enterprise: 'var(--cyan)',
}

interface Connection {
  id: string
  provider: string
  workspace_name: string | null
  workspace_id: string | null
  scopes: string[]
  connected_at: string
  needs_reconnect: boolean
}

export default function IntegrationsPage() {
  const { items: connections, loading, error, reload } = useApiList<Connection>('/v1/integrations')

  /** Which provider is mid-request, so only that button shows a spinner. */
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  // The callback redirects here with the outcome in the query string. Read
  // it once, then strip it: a reload should not replay a stale banner, and
  // the parameters are meaningless after they have been shown.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const connected = params.get('connected')
    const failed = params.get('error')

    if (connected) setNotice({ kind: 'ok', text: `${labelFor(connected)} connected successfully.` })
    else if (failed) setNotice({ kind: 'error', text: failed })

    if (connected || failed) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const connect = useCallback(async (provider: string) => {
    setBusy(provider)
    setNotice(null)
    try {
      const result = await api.post<{ authorize_url: string }>(
        `/v1/integrations/${provider}/authorize`,
        { return_to: window.location.origin + window.location.pathname }
      )
      // Full navigation, not a new tab: the provider's consent screen is a
      // step in this flow, and a popup would be blocked as often as not.
      window.location.href = result.authorize_url
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not start the connection' })
      setBusy(null)
    }
  }, [])

  const disconnect = useCallback(
    async (provider: string) => {
      if (!window.confirm(`Disconnect ${labelFor(provider)}? Agents using it will stop working.`)) return

      setBusy(provider)
      setNotice(null)
      try {
        await api.delete(`/v1/integrations/${provider}`)
        setNotice({ kind: 'ok', text: `${labelFor(provider)} disconnected.` })
        reload()
      } catch (err) {
        setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not disconnect' })
      } finally {
        setBusy(null)
      }
    },
    [reload]
  )

  const connectionFor = (id: string | null) =>
    id ? connections.find((c) => c.provider === id) ?? null : null

  return (
    <div className="p-8 space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Integrations</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--foreground-secondary)' }}>
          Connect TaskPilot to your existing tools and workflows
        </p>
      </div>

      {notice && (
        <div
          className="rounded-xl p-4 flex items-start justify-between gap-4"
          style={{
            background: notice.kind === 'ok' ? 'rgba(16,185,129,0.10)' : 'rgba(239,68,68,0.10)',
            border: `1px solid ${notice.kind === 'ok' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
          }}
        >
          <p className="text-sm" style={{ color: notice.kind === 'ok' ? '#10b981' : '#ef4444' }}>
            {notice.text}
          </p>
          <button
            onClick={() => setNotice(null)}
            className="text-xs"
            style={{ color: 'var(--foreground-tertiary)' }}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div
          className="rounded-xl p-4"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}
        >
          <p className="text-sm" style={{ color: '#ef4444' }}>
            Could not load your connections: {error}
          </p>
        </div>
      )}

      {/* Pro upgrade banner */}
      <div
        className="rounded-xl p-5 flex items-center justify-between"
        style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(34,211,238,0.05) 100%)',
          border: '1px solid rgba(99,102,241,0.2)',
        }}
      >
        <div>
          <p className="font-heading font-semibold text-sm text-foreground">
            All integrations require Pro
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--foreground-secondary)' }}>
            Upgrade to connect TaskPilot to your CRM, databases, and automation tools
          </p>
        </div>
        <button className="btn btn-primary px-5 py-2 text-sm whitespace-nowrap">
          Upgrade to Pro →
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {INTEGRATIONS.map((intg) => {
          const connection = connectionFor(intg.id)
          const available = Boolean(intg.id)
          const pending = busy === intg.id

          const state = !available
            ? { label: 'Coming soon', color: 'var(--foreground-tertiary)' }
            : connection?.needs_reconnect
              ? { label: 'Reconnect required', color: '#f59e0b' }
              : connection
                ? { label: 'Connected', color: '#10b981' }
                : { label: 'Available', color: '#10b981' }

          return (
            <div
              key={intg.name}
              className="glass rounded-xl p-5 flex items-start gap-4"
              style={{ opacity: available ? 1 : 0.65 }}
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-xl flex-shrink-0"
                style={{ background: 'var(--surface-hover)' }}
              >
                {intg.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-heading font-semibold text-sm text-foreground">{intg.name}</p>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{
                      background: 'var(--surface-hover)',
                      color: 'var(--foreground-tertiary)',
                      fontFamily: 'var(--font-heading)',
                      fontWeight: 600,
                      fontSize: '10px',
                    }}
                  >
                    {intg.category}
                  </span>
                </div>

                <p className="text-xs mb-3" style={{ color: 'var(--foreground-secondary)' }}>
                  {intg.desc}
                </p>

                {/* Which account this is wired to. Without it a user with two
                    portals cannot tell which one an agent will write to. */}
                {connection?.workspace_name && (
                  <p className="text-xs mb-3" style={{ color: 'var(--foreground-tertiary)' }}>
                    {connection.workspace_name}
                  </p>
                )}

                <div className="flex items-center justify-between gap-3">
                  <span style={{ fontSize: '11px', color: state.color, fontWeight: 600 }}>
                    ● {loading && available ? 'Checking…' : state.label}
                  </span>

                  {!available ? (
                    <span
                      className="text-xs px-3 py-1.5 rounded-md"
                      style={{
                        background: 'var(--surface)',
                        color: PLAN_COLOR[intg.plan] ?? 'var(--foreground-tertiary)',
                        fontFamily: 'var(--font-heading)',
                        fontWeight: 600,
                        fontSize: '10px',
                        border: '1px solid var(--border)',
                      }}
                    >
                      {intg.plan === 'enterprise' ? 'Enterprise' : 'Pro'}
                    </span>
                  ) : connection ? (
                    <div className="flex items-center gap-2">
                      {connection.needs_reconnect && (
                        <button
                          onClick={() => connect(intg.id!)}
                          disabled={pending}
                          className="text-xs px-3 py-1.5 rounded-md font-heading font-semibold"
                          style={{ background: 'var(--gradient-brand)', color: 'white', fontSize: '11px' }}
                        >
                          {pending ? 'Opening…' : 'Reconnect'}
                        </button>
                      )}
                      <button
                        onClick={() => disconnect(intg.id!)}
                        disabled={pending}
                        className="text-xs px-3 py-1.5 rounded-md font-heading font-semibold"
                        style={{
                          background: 'var(--surface)',
                          color: 'var(--foreground-secondary)',
                          border: '1px solid var(--border)',
                          fontSize: '11px',
                          opacity: pending ? 0.6 : 1,
                        }}
                      >
                        {pending ? 'Working…' : 'Disconnect'}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => connect(intg.id!)}
                      disabled={pending}
                      className="text-xs px-3 py-1.5 rounded-md font-heading font-semibold transition-all"
                      style={{
                        background: 'var(--gradient-brand)',
                        color: 'white',
                        fontSize: '11px',
                        opacity: pending ? 0.6 : 1,
                        cursor: pending ? 'wait' : 'pointer',
                      }}
                    >
                      {pending ? 'Opening…' : 'Connect'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* API access */}
      <div className="glass rounded-xl p-6">
        <h2 className="font-heading font-semibold text-sm mb-2 text-foreground">REST API Access</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--foreground-secondary)' }}>
          Build your own integrations with the TaskPilot API. Available on Enterprise plan.
        </p>
        <code
          className="text-xs block p-3 rounded-lg"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'var(--cyan)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          POST https://api.taskpilot.cc/v1/integrations/hubspot/push
          <br />
          Authorization: Bearer YOUR_API_KEY
          <br />
          {'{'} records: [{'{'} email, firstname, company {'}'}] {'}'}
        </code>
      </div>
    </div>
  )
}

function labelFor(provider: string): string {
  return INTEGRATIONS.find((i) => i.id === provider)?.name ?? provider
}
