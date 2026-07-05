import Link from 'next/link'
import { formatPrice, CATEGORY_LABELS } from '@/lib/format'
import { IconBot, IconCheck } from '@/components/ui/icons'

export interface AgentCardData {
  slug: string
  name: string
  tagline: string | null
  category: string
  price_cents: number
  currency: string
  sales_count: number
  seller_id: string | null
  capabilities: string[]
}

export function AgentCard({ agent }: { agent: AgentCardData }) {
  return (
    <Link
      href={`/marketplace/${agent.slug}`}
      className="ui-card ui-card-hover"
      style={{ display: 'flex', flexDirection: 'column', textDecoration: 'none', color: 'inherit', height: '100%' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--surface-active)', color: 'var(--indigo-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <IconBot size={19} />
        </div>
        <span className="badge badge-neutral">{CATEGORY_LABELS[agent.category] || agent.category}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
        <h3 style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: '-0.01em' }}>{agent.name}</h3>
        {agent.seller_id === null && (
          <span title="Official TaskPilot agent" style={{ display: 'inline-flex', color: 'var(--indigo-light)' }}><IconCheck size={14} /></span>
        )}
      </div>
      <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--foreground-secondary)', flex: 1 }}>{agent.tagline}</p>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{formatPrice(agent.price_cents, agent.currency)}</span>
        <span style={{ fontSize: 12.5, color: 'var(--foreground-tertiary)' }}>
          {agent.sales_count} {agent.sales_count === 1 ? 'install' : 'installs'}
        </span>
      </div>
    </Link>
  )
}
