'use client'

// ============================================================
// TASKPILOT — WORKFLOW BUILDER
// apps/web/src/app/dashboard/workflows/page.tsx
//
// A no-code builder for reusable multi-step automations. Steps are composed
// from the same capability catalogue the runtime executes, and validated by
// the same parser that guards published agent manifests.
// ============================================================

import { useMemo, useState } from 'react'
import {
  capabilitiesByGroup,
  getCapability,
  type BrowserActionType,
  type PlanStep,
} from '@taskpilot/shared'

import { api, useApiList, useMutation } from '@/lib/client/api'
import { EmptyState, ErrorState, SkeletonList } from '@/components/states'
import { IconWorkflow } from '@/components/ui/icons'

interface WorkflowRow {
  id: string
  name: string
  description: string | null
  trigger_type: string
  steps: PlanStep[]
  is_active: boolean
  run_count: number
  last_run_at: string | null
  schedule_cron: string | null
  next_run_at: string | null
  updated_at: string
}

/** Starting points that cover the most common automations. */
const TEMPLATES: Array<{ name: string; description: string; actions: BrowserActionType[] }> = [
  {
    name: 'Lead capture to CRM',
    description: 'Read the page, pull out the contact, push it into your CRM.',
    actions: ['read_page', 'extract_structured', 'push_integration'],
  },
  {
    name: 'Table to spreadsheet',
    description: 'Grab the main table on a page and export it.',
    actions: ['extract_table', 'export_data'],
  },
  {
    name: 'Price sweep',
    description: 'Scroll, collect every price, and export the result.',
    actions: ['read_page', 'scroll', 'extract_prices', 'export_data'],
  },
  {
    name: 'Summarise and notify',
    description: 'Summarise a long page and raise a notification.',
    actions: ['read_page', 'summarize', 'notify'],
  },
]

export default function WorkflowsPage() {
  const { items, loading, error, reload } = useApiList<WorkflowRow>('/v1/workflows')
  const [building, setBuilding] = useState(false)

  return (
    <div style={{ padding: 28, maxWidth: 940 }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Workflows</h1>
          <p style={{ fontSize: 14, color: 'var(--foreground-secondary)', marginTop: 4 }}>
            Reusable multi-step automations. Run them on demand, or on a schedule.
          </p>
        </div>
        <button
          className="btn btn-primary btn-sm"
          style={{ marginLeft: 'auto' }}
          onClick={() => setBuilding(!building)}
        >
          {building ? 'Close builder' : 'New workflow'}
        </button>
      </header>

      {building && (
        <WorkflowBuilder
          onSaved={() => {
            setBuilding(false)
            reload()
          }}
        />
      )}

      {loading ? (
        <SkeletonList rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : items.length === 0 && !building ? (
        <EmptyState
          icon={<IconWorkflow size={22} />}
          title="No workflows yet"
          description="Build one from scratch, or start from a template below."
          action={
            <button className="btn btn-primary btn-sm" onClick={() => setBuilding(true)}>
              Create a workflow
            </button>
          }
        />
      ) : (
        <div style={{ display: 'grid', gap: 11 }}>
          {items.map((workflow) => (
            <WorkflowCard key={workflow.id} workflow={workflow} onChanged={reload} />
          ))}
        </div>
      )}

      {!building && (
        <section style={{ marginTop: 30 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Start from a template</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 11 }}>
            {TEMPLATES.map((template) => (
              <TemplateCard key={template.name} template={template} onCreated={reload} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ─── CARDS ───────────────────────────────────────────────────

function WorkflowCard({ workflow, onChanged }: { workflow: WorkflowRow; onChanged: () => void }) {
  const toggle = useMutation(async () => {
    const result = await api.patch(`/v1/workflows/${workflow.id}`, { is_active: !workflow.is_active })
    onChanged()
    return result
  })

  const remove = useMutation(async () => {
    const result = await api.delete(`/v1/workflows/${workflow.id}`)
    onChanged()
    return result
  })

  return (
    <div className="ui-card" style={{ padding: 17 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, fontSize: 14.5 }}>{workflow.name}</span>

        <span
          style={{
            fontSize: 10.5,
            padding: '2px 8px',
            borderRadius: 20,
            background: workflow.is_active ? 'rgba(34,197,94,0.15)' : 'rgba(148,163,184,0.15)',
            color: workflow.is_active ? '#4ade80' : '#94a3b8',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {workflow.is_active ? 'Active' : 'Paused'}
        </span>

        {workflow.schedule_cron && (
          <span style={{ fontSize: 11.5, color: 'var(--foreground-muted)', fontFamily: 'var(--font-mono, monospace)' }}>
            {workflow.schedule_cron}
          </span>
        )}
      </div>

      {workflow.description && (
        <p style={{ fontSize: 13, color: 'var(--foreground-secondary)', marginTop: 5 }}>
          {workflow.description}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        {workflow.steps.map((step, index) => (
          <span key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                fontSize: 11,
                padding: '3px 8px',
                borderRadius: 6,
                background: 'var(--surface)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--foreground-secondary)',
              }}
            >
              {getCapability(step.action.type)?.label ?? step.action.type.replace(/_/g, ' ')}
            </span>
            {index < workflow.steps.length - 1 && (
              <span style={{ color: 'var(--foreground-muted)', fontSize: 10 }}>→</span>
            )}
          </span>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 13,
          paddingTop: 12,
          borderTop: '1px solid var(--border-subtle)',
        }}
      >
        <span style={{ fontSize: 11.5, color: 'var(--foreground-muted)' }}>
          {workflow.run_count} runs
          {workflow.next_run_at && ` · next ${new Date(workflow.next_run_at).toLocaleString()}`}
        </span>

        <button
          className="btn btn-ghost btn-sm"
          style={{ marginLeft: 'auto' }}
          disabled={toggle.pending}
          onClick={() => void toggle.run(undefined)}
        >
          {workflow.is_active ? 'Pause' : 'Resume'}
        </button>

        <button
          className="btn btn-ghost btn-sm"
          style={{ color: '#f87171' }}
          disabled={remove.pending}
          onClick={() => void remove.run(undefined)}
        >
          Delete
        </button>
      </div>

      {(toggle.error || remove.error) && (
        <div style={{ fontSize: 12, color: '#f87171', marginTop: 8 }}>{toggle.error ?? remove.error}</div>
      )}
    </div>
  )
}

function TemplateCard({
  template,
  onCreated,
}: {
  template: (typeof TEMPLATES)[number]
  onCreated: () => void
}) {
  const create = useMutation(async () => {
    const result = await api.post('/v1/workflows', {
      name: template.name,
      description: template.description,
      trigger_type: 'manual',
      steps: buildSteps(template.actions),
    })
    onCreated()
    return result
  })

  return (
    <div className="ui-card" style={{ padding: 15 }}>
      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{template.name}</div>
      <p style={{ fontSize: 12, color: 'var(--foreground-secondary)', marginTop: 4, minHeight: 32 }}>
        {template.description}
      </p>

      <button
        className="btn btn-secondary btn-sm"
        style={{ marginTop: 10, width: '100%' }}
        disabled={create.pending}
        onClick={() => void create.run(undefined)}
      >
        {create.pending ? 'Creating…' : 'Use template'}
      </button>

      {create.error && <div style={{ fontSize: 11.5, color: '#f87171', marginTop: 7 }}>{create.error}</div>}
    </div>
  )
}

// ─── BUILDER ─────────────────────────────────────────────────

function WorkflowBuilder({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [actions, setActions] = useState<BrowserActionType[]>([])
  const [scheduled, setScheduled] = useState(false)
  const [cron, setCron] = useState('0 9 * * 1-5')

  const groups = useMemo(() => capabilitiesByGroup(), [])

  const save = useMutation(async () => {
    const result = await api.post('/v1/workflows', {
      name: name.trim(),
      description: description.trim() || undefined,
      trigger_type: scheduled ? 'schedule' : 'manual',
      schedule_cron: scheduled ? cron.trim() : undefined,
      steps: buildSteps(actions),
    })
    onSaved()
    return result
  })

  return (
    <form
      className="ui-card"
      style={{ padding: 22, marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 16 }}
      onSubmit={(event) => {
        event.preventDefault()
        void save.run(undefined)
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13 }}>
        <label>
          <div style={labelStyle}>Workflow name</div>
          <input
            style={inputStyle}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nightly price sweep"
            maxLength={120}
          />
          {save.fieldErrors.name && <div style={errorStyle}>{save.fieldErrors.name}</div>}
        </label>

        <label>
          <div style={labelStyle}>Description</div>
          <input
            style={inputStyle}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this automation does"
          />
        </label>
      </div>

      <div>
        <div style={labelStyle}>Steps ({actions.length})</div>
        <p style={{ fontSize: 11.5, color: 'var(--foreground-muted)', marginBottom: 8 }}>
          Click to append. Steps run in the order you add them.
        </p>

        {actions.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              marginBottom: 12,
              padding: 10,
              background: 'var(--surface)',
              borderRadius: 9,
              border: '1px solid var(--border-subtle)',
            }}
          >
            {actions.map((action, index) => (
              <span key={`${action}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <button
                  type="button"
                  title="Remove this step"
                  onClick={() => setActions(actions.filter((_, i) => i !== index))}
                  style={{
                    fontSize: 11.5,
                    padding: '4px 9px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    background: 'rgba(99,102,241,0.16)',
                    border: '1px solid rgba(99,102,241,0.35)',
                    color: 'var(--indigo-light)',
                  }}
                >
                  {index + 1}. {getCapability(action)?.label ?? action} ×
                </button>
                {index < actions.length - 1 && (
                  <span style={{ color: 'var(--foreground-muted)', fontSize: 10 }}>→</span>
                )}
              </span>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 11, maxHeight: 260, overflowY: 'auto' }}>
          {Object.entries(groups).map(([group, definitions]) => (
            <div key={group}>
              <div
                style={{
                  fontSize: 10.5,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--foreground-muted)',
                  marginBottom: 5,
                }}
              >
                {group}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {definitions
                  .filter((definition) => definition.action !== 'finish')
                  .map((definition) => (
                    <button
                      key={definition.action}
                      type="button"
                      title={definition.description}
                      onClick={() => setActions([...actions, definition.action])}
                      style={{
                        fontSize: 11.5,
                        padding: '4px 9px',
                        borderRadius: 20,
                        cursor: 'pointer',
                        background: 'var(--surface)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--foreground-secondary)',
                      }}
                    >
                      + {definition.label}
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>

        {save.fieldErrors.steps && <div style={errorStyle}>{save.fieldErrors.steps}</div>}
      </div>

      <div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={scheduled} onChange={(e) => setScheduled(e.target.checked)} />
          Run on a schedule
        </label>

        {scheduled && (
          <div style={{ marginTop: 9 }}>
            <input
              style={{ ...inputStyle, maxWidth: 220, fontFamily: 'var(--font-mono, monospace)' }}
              value={cron}
              onChange={(e) => setCron(e.target.value)}
              placeholder="0 9 * * 1-5"
            />
            <div style={{ fontSize: 11.5, color: 'var(--foreground-muted)', marginTop: 5 }}>
              Five-field cron, interpreted in UTC. <code>0 9 * * 1-5</code> is 09:00 on weekdays.
              Scheduled workflows need the Pro plan.
            </div>
            {save.fieldErrors.schedule_cron && <div style={errorStyle}>{save.fieldErrors.schedule_cron}</div>}
          </div>
        )}
      </div>

      {save.error && (
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
          {save.error}
        </div>
      )}

      <button
        className="btn btn-primary btn-sm"
        type="submit"
        disabled={save.pending}
        style={{ alignSelf: 'flex-start' }}
      >
        {save.pending ? 'Saving…' : 'Save workflow'}
      </button>
    </form>
  )
}

// ─── HELPERS ─────────────────────────────────────────────────

/**
 * Turns a list of actions into plan steps, naming each output so a later
 * step can reference it, and terminating with a `finish` that returns the
 * last produced value.
 */
function buildSteps(actions: BrowserActionType[]): PlanStep[] {
  let lastSaved: string | null = null

  const steps: PlanStep[] = actions.map((action, index) => {
    const saveAs = producesValue(action) ? `${action}_${index + 1}` : undefined
    if (saveAs) lastSaved = saveAs

    return {
      id: `step_${index + 1}`,
      action: { type: action },
      ...(saveAs ? { save_as: saveAs } : {}),
    }
  })

  steps.push({
    id: 'finish',
    action: { type: 'finish', params: lastSaved ? { result: lastSaved } : {} },
  })

  return steps
}

/** Actions whose output is worth keeping in the run scratchpad. */
function producesValue(action: BrowserActionType): boolean {
  const definition = getCapability(action)
  return definition?.group === 'reading' || definition?.group === 'ai' || definition?.group === 'output'
}

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
const errorStyle: React.CSSProperties = { fontSize: 11.5, color: '#f87171', marginTop: 4 }
