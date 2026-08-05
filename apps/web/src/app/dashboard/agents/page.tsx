'use client'

// ============================================================
// TASKPILOT — AGENT STUDIO
// apps/web/src/app/dashboard/agents/page.tsx
//
// Build an agent without writing code: name it, say what it should achieve,
// pick capabilities, then publish. Publishing derives a manifest from the
// listing server-side, so the same validator guards both this form and the
// SDK's `defineAgent`.
// ============================================================

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AGENT_CATEGORIES,
  capabilitiesByGroup,
  type AgentCategory,
  type BrowserActionType,
  type CapabilityDefinition,
} from '@taskpilot/shared'

import { api, useApiList, useMutation } from '@/lib/client/api'
import { EmptyState, ErrorState, SkeletonList } from '@/components/states'
import { IconBot, IconStar } from '@/components/ui/icons'
import { TabBar } from '@/components/dashboard/tab-bar'

interface AgentRow {
  id: string
  slug: string
  name: string
  tagline: string | null
  goal: string | null
  category: AgentCategory
  capabilities: BrowserActionType[]
  status: 'draft' | 'listed' | 'suspended' | 'archived'
  visibility: 'private' | 'team' | 'public'
  version: string
  price_cents: number
  install_count: number
  run_count: number
  rating_avg: number
  rating_count: number
  updated_at: string
}

type Tab = 'agents' | 'create'

export default function AgentStudioPage() {
  const [tab, setTab] = useState<Tab>('agents')
  const { items, loading, error, reload } = useApiList<AgentRow>('/v1/agents')

  return (
    <div style={{ padding: 28, maxWidth: 1000 }}>
      <header style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Agent studio</h1>
        <p style={{ fontSize: 14, color: 'var(--foreground-secondary)', marginTop: 4 }}>
          Package a browser automation once, then run it anywhere — or sell it in the{' '}
          <Link href="/marketplace" style={{ color: 'var(--indigo-light)', textDecoration: 'none' }}>
            marketplace
          </Link>
          .
        </p>
      </header>

      <TabBar
        tabs={[
          { id: 'agents', label: `Your agents${items.length ? ` (${items.length})` : ''}` },
          { id: 'create', label: 'Build an agent' },
        ]}
        active={tab}
        onChange={(id) => setTab(id as Tab)}
      />

      {tab === 'create' ? (
        <AgentForm
          onCreated={() => {
            setTab('agents')
            reload()
          }}
        />
      ) : loading ? (
        <SkeletonList rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<IconBot size={22} />}
          title="No agents yet"
          description="Build your first agent to automate a repeated browser task."
          action={
            <button className="btn btn-primary btn-sm" onClick={() => setTab('create')}>
              Build an agent
            </button>
          }
        />
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {items.map((agent) => (
            <AgentCard key={agent.id} agent={agent} onChanged={reload} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── AGENT CARD ──────────────────────────────────────────────

function AgentCard({ agent, onChanged }: { agent: AgentRow; onChanged: () => void }) {
  const [message, setMessage] = useState<string | null>(null)

  const publish = useMutation(async (list: boolean) => {
    const result = await api.post<{ version: string }>(`/v1/agents/${agent.id}/publish`, { list })
    setMessage(`Published v${result.version}${list ? ' and listed' : ''}`)
    onChanged()
    return result
  })

  const remove = useMutation(async () => {
    const result = await api.delete<{ deleted?: boolean; archived?: boolean }>(`/v1/agents/${agent.id}`)
    onChanged()
    return result
  })

  return (
    <div className="ui-card" style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 9,
            background: 'var(--surface-hover)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--indigo-light)',
            flex: 'none',
          }}
        >
          <IconBot size={18} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>{agent.name}</span>
            <StatusPill status={agent.status} visibility={agent.visibility} />
            <span style={{ fontSize: 11.5, color: 'var(--foreground-muted)' }}>v{agent.version}</span>
          </div>

          <p style={{ fontSize: 13, color: 'var(--foreground-secondary)', marginTop: 4 }}>
            {agent.tagline || agent.goal || 'No description yet'}
          </p>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 9 }}>
            {agent.capabilities.slice(0, 6).map((cap) => (
              <span
                key={cap}
                style={{
                  fontSize: 11,
                  padding: '2px 7px',
                  borderRadius: 5,
                  background: 'var(--surface)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--foreground-tertiary)',
                }}
              >
                {cap.replace(/_/g, ' ')}
              </span>
            ))}
            {agent.capabilities.length > 6 && (
              <span style={{ fontSize: 11, color: 'var(--foreground-muted)' }}>
                +{agent.capabilities.length - 6}
              </span>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              gap: 16,
              marginTop: 11,
              fontSize: 11.5,
              color: 'var(--foreground-muted)',
            }}
          >
            <span>{agent.install_count} installs</span>
            <span>{agent.run_count} runs</span>
            {agent.rating_count > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <IconStar size={11} /> {agent.rating_avg} ({agent.rating_count})
              </span>
            )}
            <span>{agent.price_cents > 0 ? `$${(agent.price_cents / 100).toFixed(2)}` : 'Free'}</span>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 8,
          marginTop: 14,
          paddingTop: 13,
          borderTop: '1px solid var(--border-subtle)',
          alignItems: 'center',
        }}
      >
        <button
          className="btn btn-secondary btn-sm"
          disabled={publish.pending}
          onClick={() => void publish.run(false)}
        >
          {publish.pending ? 'Publishing…' : 'Publish version'}
        </button>

        {agent.status !== 'listed' && agent.visibility === 'public' && (
          <button
            className="btn btn-primary btn-sm"
            disabled={publish.pending}
            onClick={() => void publish.run(true)}
          >
            Publish &amp; list
          </button>
        )}

        <Link href={`/marketplace/${agent.slug}`} className="btn btn-ghost btn-sm">
          View listing
        </Link>

        <button
          className="btn btn-ghost btn-sm"
          style={{ marginLeft: 'auto', color: 'var(--danger, #ef4444)' }}
          disabled={remove.pending}
          onClick={() => void remove.run(undefined)}
        >
          {agent.install_count > 0 || agent.price_cents > 0 ? 'Archive' : 'Delete'}
        </button>
      </div>

      {(message || publish.error || remove.error) && (
        <p
          style={{
            marginTop: 10,
            fontSize: 12.5,
            color: publish.error || remove.error ? '#f87171' : 'var(--success, #22c55e)',
          }}
        >
          {publish.error ?? remove.error ?? message}
        </p>
      )}
    </div>
  )
}

function StatusPill({ status, visibility }: { status: string; visibility: string }) {
  const tone: Record<string, { bg: string; fg: string }> = {
    draft: { bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8' },
    listed: { bg: 'rgba(34,197,94,0.15)', fg: '#4ade80' },
    suspended: { bg: 'rgba(239,68,68,0.15)', fg: '#f87171' },
    archived: { bg: 'rgba(148,163,184,0.1)', fg: '#64748b' },
  }
  const colours = tone[status] ?? tone.draft

  return (
    <span
      style={{
        fontSize: 10.5,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        padding: '2px 7px',
        borderRadius: 20,
        background: colours.bg,
        color: colours.fg,
      }}
    >
      {status} · {visibility}
    </span>
  )
}

// ─── BUILDER FORM ────────────────────────────────────────────

function AgentForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [tagline, setTagline] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<AgentCategory>('automation')
  const [capabilities, setCapabilities] = useState<BrowserActionType[]>([])
  const [visibility, setVisibility] = useState<'private' | 'team' | 'public'>('private')
  const [price, setPrice] = useState('0')

  const groups = useMemo(() => capabilitiesByGroup(), [])

  const toggle = useCallback((action: BrowserActionType) => {
    setCapabilities((current) =>
      current.includes(action) ? current.filter((c) => c !== action) : [...current, action]
    )
  }, [])

  const create = useMutation(async () => {
    const priceCents = Math.round(Number.parseFloat(price || '0') * 100)

    const agent = await api.post<{ id: string }>('/v1/agents', {
      name: name.trim(),
      goal: goal.trim(),
      tagline: tagline.trim() || undefined,
      description: description.trim() || undefined,
      category,
      capabilities,
      visibility,
      price_cents: Number.isFinite(priceCents) ? priceCents : 0,
    })

    // A draft with no published version cannot be run, so publish v1
    // immediately. The author lists it separately when they are ready.
    await api.post(`/v1/agents/${agent.id}/publish`, { version: '1.0.0', changelog: 'Initial version' })

    onCreated()
    return agent
  })

  // A private agent can never carry a price — the database enforces this too.
  const priceDisabled = visibility === 'private'

  return (
    <form
      className="ui-card"
      style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 720 }}
      onSubmit={(event) => {
        event.preventDefault()
        void create.run(undefined)
      }}
    >
      <Field label="Agent name" error={create.fieldErrors.name}>
        <input
          style={inputStyle}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Lead Capture Pro"
          maxLength={120}
        />
      </Field>

      <Field
        label="What should it achieve?"
        hint="Written in plain language. The planner uses this to decide what to do."
        error={create.fieldErrors.goal}
      >
        <textarea
          style={{ ...inputStyle, minHeight: 74, resize: 'vertical' }}
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Extract the contact details on this page and push them into HubSpot"
          maxLength={2000}
        />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Category">
          <select style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value as AgentCategory)}>
            {AGENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Visibility">
          <select
            style={inputStyle}
            value={visibility}
            onChange={(e) => {
              const next = e.target.value as typeof visibility
              setVisibility(next)
              if (next === 'private') setPrice('0')
            }}
          >
            <option value="private">Private — only you</option>
            <option value="team">Team — shared with your team</option>
            <option value="public">Public — listable in the marketplace</option>
          </select>
        </Field>
      </div>

      <Field label="Tagline" hint="One line shown on the marketplace card.">
        <input
          style={inputStyle}
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          placeholder="LinkedIn profile → CRM contact in one keystroke"
          maxLength={160}
        />
      </Field>

      <Field label="Description">
        <textarea
          style={{ ...inputStyle, minHeight: 74, resize: 'vertical' }}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Explain what buyers get, and any site it is tuned for."
          maxLength={4000}
        />
      </Field>

      <Field
        label={`Capabilities (${capabilities.length} selected)`}
        hint="An agent can only ever do what it declares here. Users see this list before installing."
        error={create.fieldErrors.capabilities}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 6 }}>
          {Object.entries(groups).map(([group, definitions]) => (
            <div key={group}>
              <div
                style={{
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--foreground-muted)',
                  marginBottom: 6,
                }}
              >
                {group}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {definitions.map((definition) => (
                  <CapabilityChip
                    key={definition.action}
                    definition={definition}
                    selected={capabilities.includes(definition.action)}
                    onToggle={() => toggle(definition.action)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Field>

      <Field
        label="Price (USD)"
        hint={priceDisabled ? 'A private agent cannot be sold.' : 'Leave at 0 to publish it free.'}
        error={create.fieldErrors.price_cents}
      >
        <input
          style={{ ...inputStyle, maxWidth: 160, opacity: priceDisabled ? 0.5 : 1 }}
          type="number"
          min="0"
          step="0.01"
          value={price}
          disabled={priceDisabled}
          onChange={(e) => setPrice(e.target.value)}
        />
      </Field>

      {create.error && (
        <div
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.25)',
            color: '#fca5a5',
            fontSize: 13,
          }}
        >
          {create.error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primary" type="submit" disabled={create.pending}>
          {create.pending ? 'Creating…' : 'Create agent'}
        </button>
        <span style={{ fontSize: 12.5, color: 'var(--foreground-muted)', alignSelf: 'center' }}>
          Version 1.0.0 is published automatically so you can run it right away.
        </span>
      </div>
    </form>
  )
}

function CapabilityChip({
  definition,
  selected,
  onToggle,
}: {
  definition: CapabilityDefinition
  selected: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={`${definition.description}${definition.min_plan !== 'free' ? ` (requires ${definition.min_plan})` : ''}`}
      style={{
        fontSize: 12,
        padding: '5px 10px',
        borderRadius: 20,
        cursor: 'pointer',
        border: `1px solid ${selected ? 'rgba(99,102,241,0.5)' : 'var(--border-subtle)'}`,
        background: selected ? 'rgba(99,102,241,0.16)' : 'var(--surface)',
        color: selected ? 'var(--indigo-light)' : 'var(--foreground-secondary)',
        display: 'flex',
        alignItems: 'center',
        gap: 5,
      }}
    >
      {definition.label}
      {definition.min_plan !== 'free' && (
        <span style={{ fontSize: 9, opacity: 0.7, textTransform: 'uppercase' }}>
          {definition.min_plan}
        </span>
      )}
    </button>
  )
}

// ─── SMALL PRIMITIVES ────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 9,
  padding: '9px 11px',
  color: 'var(--foreground)',
  fontSize: 13.5,
  outline: 'none',
  fontFamily: 'inherit',
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 12.5, fontWeight: 500, marginBottom: 5 }}>{label}</div>
      {hint && (
        <div style={{ fontSize: 11.5, color: 'var(--foreground-muted)', marginBottom: 6 }}>{hint}</div>
      )}
      {children}
      {error && <div style={{ fontSize: 11.5, color: '#f87171', marginTop: 4 }}>{error}</div>}
    </label>
  )
}
