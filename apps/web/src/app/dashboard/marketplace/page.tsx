'use client'

import { Suspense, useCallback, useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { formatPrice, CATEGORY_LABELS } from '@/lib/format'
import { IconDownload, IconBot, IconArrowRight } from '@/components/ui/icons'
import { SkeletonList, EmptyState, ErrorState } from '@/components/states'

const CAPABILITIES = [
  'smart_paste', 'extract_emails', 'extract_prices', 'extract_data',
  'export_csv', 'export_excel', 'generate_reply', 'rewrite_text',
  'summarize', 'translate', 'meeting_notes', 'push_to_hubspot',
]

type Tab = 'library' | 'listings' | 'sell'

interface OwnedAgent { id: string; slug: string; name: string; tagline: string | null; category: string; price_cents: number; currency: string }
interface Listing { id: string; slug: string; name: string; status: string; price_cents: number; currency: string; sales_count: number }

export default function DashboardMarketplacePage() {
  return (
    <Suspense fallback={null}>
      <MarketplaceDashboard />
    </Suspense>
  )
}

function MarketplaceDashboard() {
  const supabase = createClientComponentClient()
  const params = useSearchParams()
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) || 'library')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [owned, setOwned] = useState<OwnedAgent[]>([])
  const [listings, setListings] = useState<Listing[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Please sign in.'); return }

      const [purchasesRes, listingsRes] = await Promise.all([
        supabase
          .from('agent_purchases')
          .select('agent:marketplace_agents(id, slug, name, tagline, category, price_cents, currency)')
          .eq('buyer_id', user.id)
          .eq('status', 'completed'),
        supabase
          .from('marketplace_agents')
          .select('id, slug, name, status, price_cents, currency, sales_count')
          .eq('seller_id', user.id)
          .order('created_at', { ascending: false }),
      ])

      if (purchasesRes.error) throw new Error(purchasesRes.error.message)
      const ownedAgents = (purchasesRes.data || [])
        .map((r: { agent: OwnedAgent | OwnedAgent[] | null }) => (Array.isArray(r.agent) ? r.agent[0] : r.agent))
        .filter(Boolean) as OwnedAgent[]
      setOwned(ownedAgents)
      setListings((listingsRes.data as Listing[]) || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your marketplace data.')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => { load() }, [load])

  return (
    <div style={{ padding: 28, maxWidth: 960 }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Marketplace</h1>
        <p style={{ fontSize: 14, color: 'var(--foreground-secondary)', marginTop: 4 }}>
          Your purchased agents, your listings, and a place to sell your own.{' '}
          <Link href="/marketplace" style={{ color: 'var(--indigo-light)', textDecoration: 'none' }}>Browse the marketplace →</Link>
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 3, padding: 3, background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 10, width: 'fit-content', marginBottom: 22 }}>
        {(['library', 'listings', 'sell'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '6px 14px', borderRadius: 7, fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer', textTransform: 'capitalize',
              background: tab === t ? 'var(--surface-active)' : 'transparent',
              color: tab === t ? 'var(--foreground)' : 'var(--foreground-tertiary)',
            }}
          >
            {t === 'sell' ? 'List an agent' : t}
          </button>
        ))}
      </div>

      {tab === 'sell' ? (
        <SellForm onCreated={() => { setTab('listings'); load() }} />
      ) : loading ? (
        <SkeletonList rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : tab === 'library' ? (
        owned.length === 0 ? (
          <EmptyState icon={<IconBot size={22} />} title="No agents yet" description="Agents you buy or claim will appear here, ready to download and deploy." action={<Link href="/marketplace" className="btn btn-primary btn-sm">Browse marketplace</Link>} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 14 }}>
            {owned.map((a) => (
              <div key={a.id} className="ui-card" style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--surface-active)', color: 'var(--indigo-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IconBot size={17} /></div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{a.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--foreground-tertiary)' }}>{CATEGORY_LABELS[a.category] || a.category}</div>
                  </div>
                </div>
                <p style={{ fontSize: 13, color: 'var(--foreground-secondary)', flex: 1, lineHeight: 1.5 }}>{a.tagline}</p>
                <a href={`/api/marketplace/agents/${a.id}/manifest`} className="btn btn-secondary btn-sm" style={{ marginTop: 12, width: '100%' }}>
                  <IconDownload size={15} /> Download
                </a>
              </div>
            ))}
          </div>
        )
      ) : (
        listings.length === 0 ? (
          <EmptyState icon={<IconBot size={22} />} title="No listings yet" description="List an agent to start selling. You keep 90% of every sale." action={<button onClick={() => setTab('sell')} className="btn btn-primary btn-sm">List an agent</button>} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {listings.map((l) => (
              <div key={l.id} className="ui-card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--surface-active)', color: 'var(--indigo-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><IconBot size={17} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{l.name}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--foreground-tertiary)' }}>{formatPrice(l.price_cents, l.currency)} · {l.sales_count} sales</div>
                </div>
                <span className={`badge ${l.status === 'listed' ? 'badge-success' : 'badge-neutral'}`}>{l.status}</span>
                {l.status === 'listed' && (
                  <Link href={`/marketplace/${l.slug}`} className="btn btn-ghost btn-sm">View <IconArrowRight size={14} /></Link>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}

function SellForm({ onCreated }: { onCreated: () => void }) {
  const supabase = createClientComponentClient()
  const [name, setName] = useState('')
  const [tagline, setTagline] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('automation')
  const [price, setPrice] = useState('')
  const [caps, setCaps] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inputStyle: React.CSSProperties = { width: '100%', height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none' }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--foreground-secondary)', marginBottom: 6 }

  const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)

  const toggleCap = (c: string) => setCaps((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!name.trim()) { setError('Give your agent a name.'); return }
    if (caps.length === 0) { setError('Pick at least one capability.'); return }
    const priceCents = Math.round(parseFloat(price || '0') * 100)
    if (Number.isNaN(priceCents) || priceCents < 0) { setError('Enter a valid price (0 for free).'); return }

    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Please sign in.')

      const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`

      const { data: agent, error: insErr } = await supabase
        .from('marketplace_agents')
        .insert({
          seller_id: user.id, slug, name: name.trim(), tagline: tagline.trim() || null,
          description: description.trim() || null, category, capabilities: caps,
          price_cents: priceCents, status: 'listed',
        })
        .select('id, slug, name, version')
        .single()
      if (insErr) throw new Error(insErr.message)

      const manifest = {
        schema: 'taskpilot.agent/v1',
        name: agent.name, slug: agent.slug, version: agent.version || '1.0.0',
        role: category, description: description.trim() || tagline.trim(),
        capabilities: caps,
        harness: { model: 'gpt-4.1-mini', token_budget_per_run: 2000, memory: { namespace: agent.slug, ttl_hours: 24 }, tools: caps },
        triggers: [{ type: 'manual', surface: 'sidebar' }],
        workflow: caps.map((c, i) => ({ step: i + 1, action: c })),
        deploy: { targets: ['extension', 'dashboard'], min_plan: 'free' },
      }

      const { error: manErr } = await supabase.from('agent_manifests').insert({ agent_id: agent.id, manifest })
      if (manErr) throw new Error(manErr.message)

      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create your listing.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="ui-card" style={{ maxWidth: 620, display: 'flex', flexDirection: 'column', gap: 16, padding: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <label style={labelStyle}>Agent name</label>
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Lead Capture Pro" />
        </div>
        <div>
          <label style={labelStyle}>Price (USD)</label>
          <input style={inputStyle} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0 for free" inputMode="decimal" />
        </div>
      </div>

      <div>
        <label style={labelStyle}>Tagline</label>
        <input style={inputStyle} value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="One line that sells it" maxLength={90} />
      </div>

      <div>
        <label style={labelStyle}>Description</label>
        <textarea style={{ ...inputStyle, height: 84, padding: '10px 12px', resize: 'vertical' }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What it does, and who it's for." />
      </div>

      <div>
        <label style={labelStyle}>Category</label>
        <select style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value)}>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div>
        <label style={labelStyle}>Capabilities <span style={{ color: 'var(--foreground-muted)' }}>· these become the agent&apos;s workflow steps</span></label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {CAPABILITIES.map((c) => {
            const on = caps.includes(c)
            return (
              <button key={c} type="button" onClick={() => toggleCap(c)} style={{
                padding: '6px 11px', borderRadius: 'var(--radius-full)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-code)',
                background: on ? 'rgba(109,118,245,0.14)' : 'var(--surface)',
                border: `1px solid ${on ? 'rgba(109,118,245,0.3)' : 'var(--border-subtle)'}`,
                color: on ? 'var(--indigo-light)' : 'var(--foreground-tertiary)',
              }}>{c}</button>
            )
          })}
        </div>
      </div>

      {error && <p role="alert" style={{ fontSize: 13, color: '#f87171', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '8px 12px' }}>{error}</p>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="submit" disabled={saving} className="btn btn-primary">{saving ? 'Publishing…' : 'Publish listing'}</button>
        <span style={{ fontSize: 12.5, color: 'var(--foreground-tertiary)' }}>You keep 90% of every sale. TaskPilot retains 10%.</span>
      </div>
    </form>
  )
}
