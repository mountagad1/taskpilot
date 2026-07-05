import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { MarketplaceHeader } from '@/components/marketplace/header'
import { BuyButton } from '@/components/marketplace/buy-button'
import { formatPrice, CATEGORY_LABELS } from '@/lib/format'
import { IconBot, IconCheck, IconArrowRight, IconZap } from '@/components/ui/icons'

export const dynamic = 'force-dynamic'

interface AgentDetail {
  id: string
  slug: string
  name: string
  tagline: string | null
  description: string | null
  category: string
  capabilities: string[]
  price_cents: number
  currency: string
  sales_count: number
  seller_id: string | null
  version: string
}

async function getAgent(slug: string) {
  const supabase = createServerComponentClient({ cookies })
  const { data } = await supabase
    .from('marketplace_agents')
    .select('id, slug, name, tagline, description, category, capabilities, price_cents, currency, sales_count, seller_id, version')
    .eq('slug', slug)
    .eq('status', 'listed')
    .maybeSingle<AgentDetail>()
  return data
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const agent = await getAgent(params.slug)
  if (!agent) return { title: 'Agent not found' }
  return { title: agent.name, description: agent.tagline || undefined }
}

const CAP_LABELS: Record<string, string> = {
  smart_paste: 'Smart Paste autofill',
  extract_emails: 'Email extraction',
  extract_prices: 'Price extraction',
  extract_data: 'Structured data extraction',
  export_csv: 'CSV export',
  export_excel: 'Excel export',
  push_to_hubspot: 'Push to HubSpot',
  generate_reply: 'AI reply generation',
  rewrite_text: 'AI rewriting',
  summarize: 'Summarization',
  translate: 'Translation',
  meeting_notes: 'Meeting notes',
}

export default async function AgentDetailPage({ params }: { params: { slug: string } }) {
  const supabase = createServerComponentClient({ cookies })
  const agent = await getAgent(params.slug)
  if (!agent) notFound()

  const {
    data: { session },
  } = await supabase.auth.getSession()
  const userId = session?.user?.id ?? null

  let owned = false
  if (userId) {
    const { data: purchase } = await supabase
      .from('agent_purchases')
      .select('id')
      .eq('agent_id', agent.id)
      .eq('buyer_id', userId)
      .eq('status', 'completed')
      .maybeSingle()
    owned = !!purchase
  }

  const isOwnListing = !!userId && agent.seller_id === userId
  const caps = Array.isArray(agent.capabilities) ? agent.capabilities : []

  return (
    <div style={{ minHeight: '100vh' }}>
      <MarketplaceHeader />

      <div className="ui-container" style={{ paddingTop: 28, paddingBottom: 80 }}>
        <Link href="/marketplace" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--foreground-tertiary)', textDecoration: 'none', marginBottom: 24 }}>
          <IconArrowRight size={14} style={{ transform: 'rotate(180deg)' }} /> Back to marketplace
        </Link>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 40, alignItems: 'start' }} className="mkt-detail-grid">
          {/* Main */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <div style={{ width: 52, height: 52, borderRadius: 13, background: 'var(--surface-active)', color: 'var(--indigo-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <IconBot size={26} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.025em' }}>{agent.name}</h1>
                  {agent.seller_id === null && (
                    <span className="badge badge-indigo"><IconCheck size={12} /> Official</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, fontSize: 13, color: 'var(--foreground-tertiary)' }}>
                  <span className="badge badge-neutral">{CATEGORY_LABELS[agent.category] || agent.category}</span>
                  <span>v{agent.version}</span>
                  <span>· {agent.sales_count} installs</span>
                </div>
              </div>
            </div>

            <p style={{ fontSize: 16, lineHeight: 1.65, color: 'var(--foreground-secondary)', marginBottom: 28 }}>
              {agent.description || agent.tagline}
            </p>

            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>What this agent can do</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10 }}>
              {caps.map((c) => (
                <div key={c} className="ui-card" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: 'var(--indigo-light)', display: 'flex' }}><IconZap size={16} /></span>
                  <span style={{ fontSize: 13.5 }}>{CAP_LABELS[c] || c}</span>
                </div>
              ))}
            </div>

            <div className="ui-card" style={{ marginTop: 28, background: 'var(--surface)' }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>What you receive</h3>
              <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--foreground-secondary)' }}>
                A deployable agent manifest (<code style={{ fontFamily: 'var(--font-code)', fontSize: 12.5 }}>{agent.slug}.agent.json</code>) —
                the full model + harness definition: capabilities, workflow steps, token budget, and deploy targets.
                Install it into your browser extension and dashboard in one click.
              </p>
            </div>
          </div>

          {/* Buy panel */}
          <aside className="ui-card" style={{ position: 'sticky', top: 84, padding: 22 }}>
            <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.02em' }}>{formatPrice(agent.price_cents, agent.currency)}</div>
            <div style={{ fontSize: 12.5, color: 'var(--foreground-tertiary)', marginBottom: 18 }}>
              {agent.price_cents === 0 ? 'Free forever' : 'One-time purchase'}
            </div>

            <BuyButton
              agentId={agent.id}
              slug={agent.slug}
              priceLabel={formatPrice(agent.price_cents, agent.currency)}
              isFree={agent.price_cents === 0}
              owned={owned}
              signedIn={!!userId}
              isOwnListing={isOwnListing}
            />

            <ul style={{ listStyle: 'none', padding: 0, margin: '18px 0 0', display: 'flex', flexDirection: 'column', gap: 9 }}>
              {['Full agent manifest', 'Deploy to extension + dashboard', 'Lifetime updates on this version'].map((t) => (
                <li key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--foreground-secondary)' }}>
                  <span style={{ color: 'var(--success)', display: 'flex' }}><IconCheck size={15} /></span> {t}
                </li>
              ))}
            </ul>

            {agent.price_cents > 0 && agent.seller_id && (
              <p style={{ marginTop: 16, fontSize: 11.5, color: 'var(--foreground-muted)', lineHeight: 1.5 }}>
                Sold by a TaskPilot creator. TaskPilot processes the payment and retains a 10% platform fee.
              </p>
            )}
          </aside>
        </div>
      </div>

      <style>{`@media (max-width: 820px) { .mkt-detail-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}
