'use client'

// ============================================================
// TASKPILOT — DEVELOPER PLATFORM
// apps/web/src/app/dashboard/developers/page.tsx
//
// API key management. The plaintext key exists exactly once, in the response
// to the create call, so this page is careful to surface it clearly and
// warn that it cannot be recovered.
// ============================================================

import { useState } from 'react'
import Link from 'next/link'
import { API_SCOPES, type ApiScope } from '@taskpilot/shared'

import { api, useApiList, useMutation } from '@/lib/client/api'
import { EmptyState, ErrorState, SkeletonList } from '@/components/states'
import { IconPlug } from '@/components/ui/icons'

interface KeyRow {
  id: string
  name: string
  key_prefix: string
  scopes: ApiScope[]
  last_used_at: string | null
  expires_at: string | null
  revoked_at: string | null
  created_at: string
}

const SCOPE_HELP: Record<ApiScope, string> = {
  'agents:read': 'List and read your agents',
  'agents:write': 'Create, update and install agents',
  'agents:publish': 'Publish new agent versions',
  'runs:read': 'Read run history and timelines',
  'runs:write': 'Start runs and report step results',
  'workflows:read': 'Read saved workflows',
  'workflows:write': 'Create and edit workflows',
  'marketplace:read': 'Browse the public catalogue',
  'exports:write': 'Generate exports',
}

const DEFAULT_SCOPES: ApiScope[] = ['agents:read', 'runs:read', 'runs:write']

export default function DevelopersPage() {
  const { items, loading, error, reload } = useApiList<KeyRow>('/v1/keys')
  const [created, setCreated] = useState<{ key: string; name: string } | null>(null)

  return (
    <div style={{ padding: 28, maxWidth: 880 }}>
      <header style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Developers</h1>
        <p style={{ fontSize: 14, color: 'var(--foreground-secondary)', marginTop: 4 }}>
          Build on TaskPilot with the{' '}
          <code style={codeStyle}>@taskpilot/sdk</code> package or the REST API.{' '}
          <Link href="/docs/api" style={{ color: 'var(--indigo-light)', textDecoration: 'none' }}>
            Read the API reference →
          </Link>
        </p>
      </header>

      {created && <NewKeyBanner secret={created.key} name={created.name} onDismiss={() => setCreated(null)} />}

      <CreateKeyForm
        onCreated={(key, name) => {
          setCreated({ key, name })
          reload()
        }}
      />

      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Your keys</h2>

        {loading ? (
          <SkeletonList rows={2} />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<IconPlug size={22} />}
            title="No API keys yet"
            description="Create one above to call the TaskPilot API from your own code."
          />
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {items.map((key) => (
              <KeyCard key={key.id} apiKey={key} onChanged={reload} />
            ))}
          </div>
        )}
      </section>

      <QuickStart />
    </div>
  )
}

// ─── NEW KEY ─────────────────────────────────────────────────

function NewKeyBanner({
  secret,
  name,
  onDismiss,
}: {
  secret: string
  name: string
  onDismiss: () => void
}) {
  const [copied, setCopied] = useState(false)

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 12,
        marginBottom: 20,
        background: 'rgba(34,197,94,0.08)',
        border: '1px solid rgba(34,197,94,0.3)',
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 14, color: '#4ade80', marginBottom: 5 }}>
        {name} created
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--foreground-secondary)', marginBottom: 11 }}>
        Copy this key now — TaskPilot stores only a hash, so it cannot be shown again.
      </p>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <code
          style={{
            ...codeStyle,
            flex: 1,
            padding: '9px 11px',
            fontSize: 12.5,
            wordBreak: 'break-all',
            background: 'var(--background)',
          }}
        >
          {secret}
        </code>
        <button
          className="btn btn-secondary btn-sm"
          onClick={async () => {
            await navigator.clipboard.writeText(secret)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onDismiss}>
          Done
        </button>
      </div>
    </div>
  )
}

// ─── CREATE ──────────────────────────────────────────────────

function CreateKeyForm({ onCreated }: { onCreated: (key: string, name: string) => void }) {
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<ApiScope[]>(DEFAULT_SCOPES)
  const [expiry, setExpiry] = useState('')

  const create = useMutation(async () => {
    const result = await api.post<{ key: string; name: string }>('/v1/keys', {
      name: name.trim(),
      scopes,
      expires_in_days: expiry ? Number(expiry) : undefined,
    })
    setName('')
    setScopes(DEFAULT_SCOPES)
    onCreated(result.key, result.name)
    return result
  })

  const toggle = (scope: ApiScope) =>
    setScopes((current) =>
      current.includes(scope) ? current.filter((s) => s !== scope) : [...current, scope]
    )

  return (
    <form
      className="ui-card"
      style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 15 }}
      onSubmit={(event) => {
        event.preventDefault()
        void create.run(undefined)
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
        <label>
          <div style={labelStyle}>Key name</div>
          <input
            style={inputStyle}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="CI deploy pipeline"
            maxLength={80}
          />
          {create.fieldErrors.name && <div style={errorTextStyle}>{create.fieldErrors.name}</div>}
        </label>

        <label>
          <div style={labelStyle}>Expires</div>
          <select style={inputStyle} value={expiry} onChange={(e) => setExpiry(e.target.value)}>
            <option value="">Never</option>
            <option value="30">In 30 days</option>
            <option value="90">In 90 days</option>
            <option value="365">In a year</option>
          </select>
        </label>
      </div>

      <div>
        <div style={labelStyle}>Scopes</div>
        <p style={{ fontSize: 11.5, color: 'var(--foreground-muted)', marginBottom: 8 }}>
          Grant only what this key needs. Key management itself is never available to a key.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {API_SCOPES.map((scope) => (
            <button
              key={scope}
              type="button"
              title={SCOPE_HELP[scope]}
              onClick={() => toggle(scope)}
              style={{
                fontSize: 12,
                padding: '5px 10px',
                borderRadius: 20,
                cursor: 'pointer',
                fontFamily: 'var(--font-mono, monospace)',
                border: `1px solid ${scopes.includes(scope) ? 'rgba(99,102,241,0.5)' : 'var(--border-subtle)'}`,
                background: scopes.includes(scope) ? 'rgba(99,102,241,0.16)' : 'var(--surface)',
                color: scopes.includes(scope) ? 'var(--indigo-light)' : 'var(--foreground-secondary)',
              }}
            >
              {scope}
            </button>
          ))}
        </div>
        {create.fieldErrors.scopes && <div style={errorTextStyle}>{create.fieldErrors.scopes}</div>}
      </div>

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

      <button className="btn btn-primary btn-sm" type="submit" disabled={create.pending} style={{ alignSelf: 'flex-start' }}>
        {create.pending ? 'Creating…' : 'Create API key'}
      </button>
    </form>
  )
}

// ─── KEY CARD ────────────────────────────────────────────────

function KeyCard({ apiKey, onChanged }: { apiKey: KeyRow; onChanged: () => void }) {
  const revoked = Boolean(apiKey.revoked_at)
  const expired = Boolean(apiKey.expires_at && new Date(apiKey.expires_at) < new Date())

  const revoke = useMutation(async () => {
    const result = await api.delete(`/v1/keys/${apiKey.id}`)
    onChanged()
    return result
  })

  return (
    <div className="ui-card" style={{ padding: 15, opacity: revoked ? 0.55 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{apiKey.name}</span>
        <code style={{ ...codeStyle, fontSize: 11.5 }}>tp_live_{apiKey.key_prefix}…</code>

        {revoked && <Pill tone="#ef4444">Revoked</Pill>}
        {!revoked && expired && <Pill tone="#f59e0b">Expired</Pill>}
        {!revoked && !expired && <Pill tone="#22c55e">Active</Pill>}

        {!revoked && (
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: 'auto', color: '#f87171' }}
            disabled={revoke.pending}
            onClick={() => void revoke.run(undefined)}
          >
            {revoke.pending ? 'Revoking…' : 'Revoke'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 9 }}>
        {apiKey.scopes.map((scope) => (
          <span
            key={scope}
            style={{
              fontSize: 10.5,
              padding: '2px 7px',
              borderRadius: 5,
              background: 'var(--surface)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--foreground-tertiary)',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            {scope}
          </span>
        ))}
      </div>

      <div style={{ marginTop: 9, fontSize: 11.5, color: 'var(--foreground-muted)', display: 'flex', gap: 14 }}>
        <span>Created {new Date(apiKey.created_at).toLocaleDateString()}</span>
        <span>
          {apiKey.last_used_at
            ? `Last used ${new Date(apiKey.last_used_at).toLocaleDateString()}`
            : 'Never used'}
        </span>
        {apiKey.expires_at && <span>Expires {new Date(apiKey.expires_at).toLocaleDateString()}</span>}
      </div>

      {revoke.error && <div style={errorTextStyle}>{revoke.error}</div>}
    </div>
  )
}

function Pill({ children, tone }: { children: React.ReactNode; tone: string }) {
  return (
    <span
      style={{
        fontSize: 10.5,
        padding: '2px 8px',
        borderRadius: 20,
        background: `${tone}22`,
        color: tone,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      {children}
    </span>
  )
}

// ─── QUICK START ─────────────────────────────────────────────

function QuickStart() {
  return (
    <section style={{ marginTop: 32 }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Quick start</h2>

      <div className="ui-card" style={{ padding: 18 }}>
        <pre
          style={{
            fontSize: 12,
            lineHeight: 1.65,
            overflowX: 'auto',
            color: 'var(--foreground-secondary)',
            fontFamily: 'var(--font-mono, monospace)',
          }}
        >
{`npm install @taskpilot/sdk

import { TaskPilot, defineAgent } from '@taskpilot/sdk'

const taskpilot = new TaskPilot({ apiKey: process.env.TASKPILOT_API_KEY })

const agent = defineAgent({
  name: 'Email Harvester',
  goal: 'Collect every email address on the page and export it as CSV',
})
  .workflow((s) => {
    s.readPage('page')
     .extractEmails('emails')
     .export('emails', 'csv')
     .finish('export')
  })

await taskpilot.publish(agent, { list: true })`}
        </pre>
      </div>
    </section>
  )
}

// ─── STYLES ──────────────────────────────────────────────────

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

const labelStyle: React.CSSProperties = { fontSize: 12.5, fontWeight: 500, marginBottom: 5 }

const errorTextStyle: React.CSSProperties = { fontSize: 11.5, color: '#f87171', marginTop: 4 }

const codeStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono, monospace)',
  background: 'var(--surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 6,
  padding: '2px 6px',
}
