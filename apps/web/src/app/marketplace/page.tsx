import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import type { Metadata } from 'next'
import { MarketplaceHeader } from '@/components/marketplace/header'
import { AgentCard, type AgentCardData } from '@/components/marketplace/agent-card'
import { CATEGORY_LABELS } from '@/lib/format'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Agent Marketplace',
  description: 'Buy and sell deployable AI agents built on TaskPilot. One-click install into your browser and dashboard.',
}

export const dynamic = 'force-dynamic'

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: { category?: string }
}) {
  const supabase = createServerComponentClient({ cookies })

  let query = supabase
    .from('marketplace_agents')
    .select('slug, name, tagline, category, price_cents, currency, sales_count, seller_id, capabilities')
    .eq('status', 'listed')
    .order('sales_count', { ascending: false })

  if (searchParams.category) query = query.eq('category', searchParams.category)

  const { data } = await query
  const agents = (data as AgentCardData[] | null) ?? []

  const categories = Object.keys(CATEGORY_LABELS)

  return (
    <div style={{ minHeight: '100vh' }}>
      <MarketplaceHeader />

      <section style={{ paddingTop: 48, paddingBottom: 24 }}>
        <div className="ui-container" style={{ textAlign: 'center' }}>
          <span className="eyebrow">Agent marketplace</span>
          <h1 style={{ marginTop: 16, fontSize: 'clamp(30px,4vw,44px)', fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.08 }}>
            Deployable agents, <span className="gradient-text">ready to install.</span>
          </h1>
          <p style={{ marginTop: 14, maxWidth: 520, marginInline: 'auto', fontSize: 16, lineHeight: 1.6, color: 'var(--foreground-secondary)' }}>
            Browse agents built on TaskPilot&apos;s task engine. Buy one and get the full agent manifest — deploy it to your browser and dashboard in a click.
          </p>
          <div style={{ marginTop: 22, display: 'flex', justifyContent: 'center', gap: 8 }}>
            <Link href="/dashboard/marketplace?tab=sell" className="btn btn-primary">Sell your agent</Link>
            <Link href="/dashboard/marketplace" className="btn btn-secondary">My library</Link>
          </div>
        </div>
      </section>

      <div className="ui-container" style={{ paddingBottom: 80 }}>
        {/* Category filter */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 32 }}>
          <FilterPill href="/marketplace" active={!searchParams.category} label="All" />
          {categories.map((c) => (
            <FilterPill key={c} href={`/marketplace?category=${c}`} active={searchParams.category === c} label={CATEGORY_LABELS[c]} />
          ))}
        </div>

        {agents.length === 0 ? (
          <div className="ui-card" style={{ textAlign: 'center', padding: '56px 24px', color: 'var(--foreground-tertiary)' }}>
            No agents in this category yet.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {agents.map((a) => (
              <AgentCard key={a.slug} agent={a} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function FilterPill({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className="lp-pill"
      style={{
        padding: '7px 14px',
        borderRadius: 'var(--radius-full)',
        fontSize: 13,
        fontWeight: 500,
        textDecoration: 'none',
        background: active ? 'rgba(109,118,245,0.12)' : 'var(--surface)',
        border: `1px solid ${active ? 'rgba(109,118,245,0.28)' : 'var(--border-subtle)'}`,
        color: active ? 'var(--indigo-light)' : 'var(--foreground-secondary)',
      }}
    >
      {label}
    </Link>
  )
}
