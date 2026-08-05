'use client'

// ============================================================
// TASKPILOT — MARKETPLACE LIBRARY
// apps/web/src/app/dashboard/marketplace/page.tsx
//
// The buyer's side of the marketplace: agents you have installed or bought,
// and how your own listings are performing. Authoring lives in the Agent
// Studio, so this page never duplicates the create flow.
// ============================================================

import { Suspense, useState } from 'react'
import Link from 'next/link'

import { formatPrice } from '@/lib/format'
import { api, useApiList, useMutation } from '@/lib/client/api'
import { EmptyState, ErrorState, SkeletonList } from '@/components/states'
import { IconBot, IconArrowRight, IconStar } from '@/components/ui/icons'
import { DownloadManifestButton } from '@/components/marketplace/buy-button'
import { TabBar } from '@/components/dashboard/tab-bar'

type Tab = 'library' | 'listings'

interface AgentRow {
  id: string
  slug: string
  name: string
  tagline: string | null
  category: string
  status: string
  visibility: string
  price_cents: number
  currency: string
  version: string
  install_count: number
  run_count: number
  sales_count: number
  rating_avg: number
  rating_count: number
}

interface InstalledAgent {
  id: string
  agent_id: string
  version: string
  enabled: boolean
  installed_at: string
  last_run_at: string | null
  agent: AgentRow | AgentRow[] | null
}

export default function DashboardMarketplacePage() {
  return (
    <Suspense fallback={<SkeletonList rows={3} />}>
      <MarketplaceLibrary />
    </Suspense>
  )
}

function MarketplaceLibrary() {
  const [tab, setTab] = useState<Tab>('library')
  const listings = useApiList<AgentRow>('/v1/agents')

  return (
    <div style={{ padding: 28, maxWidth: 960 }}>
      <header style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Marketplace</h1>
        <p style={{ fontSize: 14, color: 'var(--foreground-secondary)', marginTop: 4 }}>
          Agents you have installed, and how your own listings are doing.{' '}
          <Link href="/marketplace" style={{ color: 'var(--indigo-light)', textDecoration: 'none' }}>
            Browse the catalogue →
          </Link>
        </p>
      </header>

      <TabBar
        tabs={[
          { id: 'library', label: 'Your library' },
          { id: 'listings', label: `Your listings${listings.items.length ? ` (${listings.items.length})` : ''}` },
        ]}
        active={tab}
        onChange={(id) => setTab(id as Tab)}
      />

      {tab === 'library' ? <Library /> : <Listings state={listings} />}
    </div>
  )
}

// ─── LIBRARY ─────────────────────────────────────────────────

function Library() {
  // The installs endpoint embeds the agent so the card can render in one pass.
  const { items, loading, error, reload } = useApiList<InstalledAgent>('/v1/agents?installed=true')

  if (loading) return <SkeletonList rows={3} />
  if (error) return <ErrorState message={error} onRetry={reload} />

  const installs = items
    .map((install) => ({
      ...install,
      agent: Array.isArray(install.agent) ? install.agent[0] : install.agent,
    }))
    .filter((install) => install.agent)

  if (installs.length === 0) {
    return (
      <EmptyState
        icon={<IconBot size={22} />}
        title="No agents installed"
        description="Install an agent from the marketplace and it becomes available in the extension straight away."
        action={
          <Link href="/marketplace" className="btn btn-primary btn-sm">
            Browse marketplace
          </Link>
        }
      />
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 13 }}>
      {installs.map((install) => (
        <InstalledCard key={install.id} install={install as InstalledAgent & { agent: AgentRow }} onChanged={reload} />
      ))}
    </div>
  )
}

function InstalledCard({
  install,
  onChanged,
}: {
  install: InstalledAgent & { agent: AgentRow }
  onChanged: () => void
}) {
  const agent = install.agent

  const uninstall = useMutation(async () => {
    const result = await api.delete(`/v1/agents/${agent.id}/install`)
    onChanged()
    return result
  })

  const upgrade = useMutation(async () => {
    const result = await api.post(`/v1/agents/${agent.id}/install`, {})
    onChanged()
    return result
  })

  const outdated = install.version !== agent.version

  return (
    <div className="ui-card" style={{ display: 'flex', flexDirection: 'column', padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'var(--surface-hover)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--indigo-light)',
            flex: 'none',
          }}
        >
          <IconBot size={16} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{agent.name}</div>
          <div style={{ fontSize: 11.5, color: 'var(--foreground-muted)' }}>v{install.version}</div>
        </div>
      </div>

      <p style={{ fontSize: 12.5, color: 'var(--foreground-secondary)', flex: 1, minHeight: 34 }}>
        {agent.tagline ?? 'No description'}
      </p>

      {outdated && (
        <div
          style={{
            fontSize: 11.5,
            color: '#fbbf24',
            background: 'rgba(245,158,11,0.1)',
            borderRadius: 7,
            padding: '6px 9px',
            marginTop: 9,
          }}
        >
          Version {agent.version} is available.
        </div>
      )}

      <div style={{ display: 'flex', gap: 7, marginTop: 12 }}>
        {outdated && (
          <button className="btn btn-primary btn-sm" disabled={upgrade.pending} onClick={() => void upgrade.run(undefined)}>
            {upgrade.pending ? 'Updating…' : 'Update'}
          </button>
        )}
        <DownloadManifestButton agentId={agent.id} slug={agent.slug} />
        <button
          className="btn btn-ghost btn-sm"
          style={{ marginLeft: 'auto', color: '#f87171' }}
          disabled={uninstall.pending}
          onClick={() => void uninstall.run(undefined)}
        >
          Remove
        </button>
      </div>

      {(uninstall.error || upgrade.error) && (
        <div style={{ fontSize: 11.5, color: '#f87171', marginTop: 8 }}>
          {uninstall.error ?? upgrade.error}
        </div>
      )}
    </div>
  )
}

// ─── LISTINGS ────────────────────────────────────────────────

function Listings({ state }: { state: ReturnType<typeof useApiList<AgentRow>> }) {
  const { items, loading, error, reload } = state

  if (loading) return <SkeletonList rows={3} />
  if (error) return <ErrorState message={error} onRetry={reload} />

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<IconBot size={22} />}
        title="You have no listings"
        description="Build an agent in the studio, then publish it to the marketplace to start selling."
        action={
          <Link href="/dashboard/agents" className="btn btn-primary btn-sm">
            Open agent studio <IconArrowRight size={13} />
          </Link>
        }
      />
    )
  }

  const revenueCents = items.reduce((sum, agent) => sum + agent.sales_count * agent.price_cents, 0)
  const grossRevenue = revenueCents / 100

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 11, marginBottom: 20 }}>
        <Stat label="Listings" value={items.length} />
        <Stat label="Installs" value={items.reduce((s, a) => s + a.install_count, 0)} />
        <Stat label="Runs" value={items.reduce((s, a) => s + a.run_count, 0)} />
        <Stat
          label="Gross sales"
          value={`$${grossRevenue.toFixed(2)}`}
          // Sellers keep 90%; the platform fee is 10% of each sale.
          hint={`You keep $${(grossRevenue * 0.9).toFixed(2)}`}
        />
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {items.map((agent) => (
          <div key={agent.id} className="ui-card" style={{ padding: 15, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{agent.name}</span>
                <span
                  style={{
                    fontSize: 10.5,
                    padding: '2px 7px',
                    borderRadius: 20,
                    background: agent.status === 'listed' ? 'rgba(34,197,94,0.15)' : 'rgba(148,163,184,0.15)',
                    color: agent.status === 'listed' ? '#4ade80' : '#94a3b8',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {agent.status}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 14, marginTop: 5, fontSize: 11.5, color: 'var(--foreground-muted)' }}>
                <span>{agent.install_count} installs</span>
                <span>{agent.sales_count} sales</span>
                <span>{agent.run_count} runs</span>
                {agent.rating_count > 0 && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <IconStar size={11} /> {agent.rating_avg}
                  </span>
                )}
              </div>
            </div>

            <span style={{ fontSize: 13, fontWeight: 500 }}>{formatPrice(agent.price_cents, agent.currency)}</span>

            <Link href={`/marketplace/${agent.slug}`} className="btn btn-ghost btn-sm">
              View
            </Link>
          </div>
        ))}
      </div>
    </>
  )
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="ui-card" style={{ padding: 14 }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--foreground-muted)' }}>
        {label}
      </div>
      <div style={{ fontSize: 21, fontWeight: 600, marginTop: 4 }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: 'var(--foreground-muted)', marginTop: 2 }}>{hint}</div>}
    </div>
  )
}
