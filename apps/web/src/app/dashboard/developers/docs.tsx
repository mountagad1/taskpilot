'use client'

// ============================================================
// TASKPILOT — DEVELOPER DOCUMENTATION (in-dashboard)
// apps/web/src/app/dashboard/developers/docs.tsx
//
// Lives inside Dashboard → Developers rather than a public /docs/api route:
// a developer already has a key on this page, so the quick start can use it
// directly instead of sending them to a separate site to come back with it.
//
// The capability table is read from @taskpilot/shared at render time, not
// retyped here — the same catalogue the manifest validator and the studio's
// capability picker use, so this page cannot drift from what agents can
// actually do. Everything else mirrors docs/api/README.md and
// packages/sdk/README.md, which remain the canonical reference.
// ============================================================

import { useState } from 'react'
import {
  API_SCOPES,
  capabilitiesByGroup,
  type ApiScope,
  type CapabilityGroup,
} from '@taskpilot/shared'
import { IconArrowRight, IconBook, IconCheck, IconCopy, IconTerminal } from '@/components/ui/icons'

const GROUP_LABEL: Record<CapabilityGroup, string> = {
  navigation: 'Navigation',
  interaction: 'Interaction',
  reading: 'Reading',
  forms: 'Forms',
  files: 'Files',
  ai: 'AI',
  output: 'Output',
  control: 'Control',
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

const ERROR_CODES: Array<[string, string, string]> = [
  ['bad_request', '400', 'Malformed request'],
  ['unauthorized', '401', 'Missing or invalid credentials'],
  ['payment_required', '402', 'A paid agent must be purchased first'],
  ['plan_limit', '402', "The account's plan does not allow this"],
  ['forbidden', '403', 'Authenticated, not permitted'],
  ['not_found', '404', 'No such resource, or not visible to you'],
  ['conflict', '409', 'Version not newer, duplicate invite, already owned'],
  ['validation_failed', '422', 'Field-level problems in `issues`'],
  ['rate_limited', '429', 'Slow down; see `Retry-After`'],
  ['not_configured', '503', 'The deployment is missing a required service'],
]

const NAV = [
  { id: 'quickstart', label: 'Quick start' },
  { id: 'auth', label: 'Authentication' },
  { id: 'agents', label: 'Building an agent' },
  { id: 'capabilities', label: 'Capabilities' },
  { id: 'runs', label: 'Running agents' },
  { id: 'errors', label: 'Errors' },
  { id: 'reference', label: 'Full reference' },
] as const

export function DeveloperDocs({ keyPrefix }: { keyPrefix?: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 32, alignItems: 'start' }}>
      <nav
        style={{
          position: 'sticky',
          top: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
        className="docs-side-nav"
      >
        {NAV.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            style={{
              fontSize: 12.5,
              padding: '6px 10px',
              borderRadius: 7,
              color: 'var(--foreground-tertiary)',
              textDecoration: 'none',
            }}
          >
            {item.label}
          </a>
        ))}
        <a
          href="https://github.com/mountagad1/taskpilot/blob/main/docs/api/README.md"
          target="_blank"
          rel="noreferrer"
          style={{
            fontSize: 12,
            padding: '6px 10px',
            marginTop: 8,
            color: 'var(--indigo-light)',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <IconBook size={13} /> Full docs
        </a>
      </nav>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 36, minWidth: 0 }}>
        <QuickStart keyPrefix={keyPrefix} />
        <Authentication />
        <BuildingAnAgent />
        <Capabilities />
        <RunningAgents />
        <Errors />
        <FullReference />
      </div>
    </div>
  )
}

// ─── SECTIONS ────────────────────────────────────────────────

function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id} style={{ scrollMarginTop: 20 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>{title}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
    </section>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--foreground-secondary)' }}>
      {children}
    </p>
  )
}

function QuickStart({ keyPrefix }: { keyPrefix?: string }) {
  const keyLine = keyPrefix
    ? `// Using your key tp_live_${keyPrefix}… — set it as TASKPILOT_API_KEY, never hard-coded`
    : `// Create a key above, then set it as TASKPILOT_API_KEY`

  const code = `npm install @taskpilot/sdk

import { TaskPilot, defineAgent } from '@taskpilot/sdk'

${keyLine}
const taskpilot = new TaskPilot({ apiKey: process.env.TASKPILOT_API_KEY })

const agent = defineAgent({
  name: 'Email Harvester',
  goal: 'Collect every email address on the page and export it as a CSV',
  category: 'extraction',
})
  .describe('Scans the visible page for email addresses, dedupes them, and hands back a CSV.')
  .workflow((s) => {
    s.readPage('page')
      .extractEmails('emails')
      .export('emails', 'csv', { filename: 'contacts' })
      .finish('export')
  })

// Validates locally with the same rules the registry enforces server-side.
await taskpilot.publish(agent, { list: true, priceCents: 0 })`

  return (
    <Section id="quickstart" title="Quick start">
      <P>
        The SDK plans nothing itself — it authors a manifest, publishes it, and starts runs. Plans
        are computed server-side and executed in the installer&apos;s browser, so this script never
        touches a page directly.
      </P>
      <CodeBlock code={code} />
      <P>
        <code style={inlineCode}>defineAgent(...).build()</code> runs the exact validator the
        server does — a manifest that builds locally is one the registry will accept.
      </P>
    </Section>
  )
}

function Authentication() {
  return (
    <Section id="auth" title="Authentication">
      <P>
        Every key you create above carries only the scopes you grant it. A request outside them
        returns <code style={inlineCode}>403 forbidden</code> naming the missing scope — key
        management itself is never grantable, so a leaked key cannot mint another.
      </P>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {API_SCOPES.map((scope) => (
          <span key={scope} title={SCOPE_HELP[scope]} style={scopePill}>
            {scope}
          </span>
        ))}
      </div>
      <CodeBlock
        code={`new TaskPilot({ apiKey: 'tp_live_...' })           // explicit
new TaskPilot()                                     // reads TASKPILOT_API_KEY
new TaskPilot({ baseUrl: 'http://localhost:4000' }) // point at a local API`}
      />
      <P>
        In a browser where the user is already signed in, omit the key entirely — the client sends
        their session instead.
      </P>
    </Section>
  )
}

function BuildingAnAgent() {
  return (
    <Section id="agents" title="Building an agent">
      <P>
        Every step method returns the builder, so a workflow reads top to bottom in the order it
        runs. Capabilities are <strong>derived from the workflow</strong> — you cannot forget to
        declare one.
      </P>
      <CodeBlock
        code={`defineAgent({ name: 'Lead Capture', goal: 'Capture the contact and push it to the CRM' })
  .category('sales')
  .workflow((s) => {
    s.readPage('page')
      .extractStructured(['name', 'email', 'company', 'job_title'], 'contact')
      .pushTo('hubspot', 'contact')
      .notify('Contact captured')
      .finish('contact')
  })
  .build()`}
      />
      <P>
        <code style={inlineCode}>save_as</code> names a step&apos;s output;{' '}
        <code style={inlineCode}>{'{{name}}'}</code> reads it back in a later step. Target elements
        with a bare string — selector-shaped strings become CSS, phrases become visible-text
        matches — or an explicit strategy with fallbacks:
      </P>
      <CodeBlock
        code={`s.click('#save')                                   // -> css
s.click('Save changes')                            // -> visible text
s.click({
  by: 'testid',
  value: 'submit-btn',
  fallbacks: [{ by: 'role', value: 'button' }, { by: 'text', value: 'Submit' }],
})`}
      />
    </Section>
  )
}

function Capabilities() {
  const groups = capabilitiesByGroup()
  const order: CapabilityGroup[] = [
    'navigation',
    'interaction',
    'reading',
    'forms',
    'files',
    'ai',
    'output',
    'control',
  ]

  return (
    <Section id="capabilities" title="Capabilities">
      <P>
        An agent may only perform what it declares, intersected with what the caller&apos;s plan
        permits — even a workflow baked into a published manifest is re-checked on every run. This
        table is read live from the same catalogue the manifest validator uses, so it cannot list
        an action the runtime does not actually support.
      </P>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {order
          .filter((g) => groups[g]?.length)
          .map((group) => (
            <div key={group}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  color: 'var(--foreground-muted)',
                  marginBottom: 7,
                }}
              >
                {GROUP_LABEL[group]}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {groups[group].map((cap) => (
                  <span key={cap.action} title={cap.description} style={capabilityPill(cap.min_plan)}>
                    {cap.action}
                    {cap.min_plan !== 'free' && <span style={{ opacity: 0.7 }}> · {cap.min_plan}</span>}
                    {cap.uses_ai && <span style={{ opacity: 0.7 }}> · AI</span>}
                  </span>
                ))}
              </div>
            </div>
          ))}
      </div>
      <P>
        <code style={inlineCode}>navigate</code>, <code style={inlineCode}>download_file</code>,{' '}
        <code style={inlineCode}>upload_file</code> and <code style={inlineCode}>push_integration</code>{' '}
        require user confirmation by default. Add capabilities the planner may need beyond the
        workflow with <code style={inlineCode}>.can(&apos;screenshot&apos;)</code>.
      </P>
    </Section>
  )
}

function RunningAgents() {
  return (
    <Section id="runs" title="Running agents">
      <P>
        Runs are planned on the server and executed in the user&apos;s browser, so the backend
        never holds their session cookies. <code style={inlineCode}>start()</code> returns the
        plan; the extension carries it out and reports back.
      </P>
      <CodeBlock
        code={`const { run, plan } = await taskpilot.start({
  agentId: 'agent-uuid',
  context: { url: 'https://example.com', title: 'Example', visible_text: '...' },
})

const finished = await taskpilot.watch(run.id!, {
  onUpdate: (r) => console.log(r.status, \`\${r.steps_completed}/\${r.steps_total}\`),
})

console.log(finished.output.result)`}
      />
      <P>
        Preview without touching a page or storing anything:{' '}
        <code style={inlineCode}>taskpilot.plan({'{ goal, context }'})</code>.
      </P>
    </Section>
  )
}

function Errors() {
  return (
    <Section id="errors" title="Errors">
      <P>
        Every failure is a <code style={inlineCode}>TaskPilotError</code> carrying the server&apos;s
        envelope, including field-level <code style={inlineCode}>issues</code> on validation
        failures. Retries for <code style={inlineCode}>429</code> and <code style={inlineCode}>5xx</code>{' '}
        are automatic, honouring <code style={inlineCode}>Retry-After</code>.
      </P>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--foreground-muted)' }}>
              <th style={th}>Code</th>
              <th style={th}>HTTP</th>
              <th style={th}>Meaning</th>
            </tr>
          </thead>
          <tbody>
            {ERROR_CODES.map(([code, status, meaning]) => (
              <tr key={code} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <td style={td}>
                  <code style={inlineCode}>{code}</code>
                </td>
                <td style={td}>{status}</td>
                <td style={{ ...td, color: 'var(--foreground-secondary)' }}>{meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CodeBlock
        code={`import { TaskPilotError } from '@taskpilot/sdk'

try {
  await taskpilot.publish(agent)
} catch (err) {
  if (err instanceof TaskPilotError) {
    console.error(err.code, err.message)
    err.issues?.forEach((i) => console.error(\`  \${i.path}: \${i.message}\`))
  }
}`}
      />
    </Section>
  )
}

function FullReference() {
  const rows: Array<[string, string]> = [
    ['taskpilot.agents()', 'list get create update remove publish versions install uninstall manifest reviews review'],
    ['taskpilot.runs()', 'list get create reportStep complete cancel'],
    ['taskpilot.workflows()', 'list get create update remove'],
    ['taskpilot.marketplace()', 'browse checkout'],
    ['taskpilot.teams()', 'list create members invite acceptInvite removeMember'],
    ['taskpilot.keys()', 'list create revoke'],
    ['taskpilot.notifications()', 'list markRead'],
  ]

  return (
    <Section id="reference" title="Full reference">
      <P>
        Every namespace on the client, and the REST surface it wraps. Base URL:{' '}
        <code style={inlineCode}>https://api.taskpilot.cc</code> · discovery document:{' '}
        <code style={inlineCode}>GET /v1</code>.
      </P>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map(([ns, methods]) => (
          <div key={ns} className="ui-card" style={{ padding: '10px 13px' }}>
            <code style={{ ...inlineCode, background: 'transparent', border: 'none', padding: 0 }}>
              {ns}
            </code>
            <div style={{ fontSize: 12, color: 'var(--foreground-tertiary)', marginTop: 3 }}>
              {methods}
            </div>
          </div>
        ))}
      </div>
      <a
        href="https://github.com/mountagad1/taskpilot/blob/main/docs/api/README.md"
        target="_blank"
        rel="noreferrer"
        className="btn btn-secondary btn-sm"
        style={{ alignSelf: 'flex-start' }}
      >
        <IconBook size={14} /> REST reference <IconArrowRight size={13} />
      </a>
    </Section>
  )
}

// ─── SHARED PIECES ───────────────────────────────────────────

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <div className="ui-card" style={{ padding: 0, position: 'relative', background: 'var(--surface)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '7px 12px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--foreground-muted)' }}>
          <IconTerminal size={12} /> TypeScript
        </span>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(code)
            setCopied(true)
            setTimeout(() => setCopied(false), 1600)
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 11,
            padding: '3px 8px',
            borderRadius: 6,
            border: '1px solid var(--border-subtle)',
            background: 'transparent',
            color: copied ? '#4ade80' : 'var(--foreground-tertiary)',
            cursor: 'pointer',
          }}
        >
          {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre
        style={{
          margin: 0,
          padding: '13px 15px',
          fontSize: 12,
          lineHeight: 1.65,
          overflowX: 'auto',
          color: 'var(--foreground-secondary)',
          fontFamily: 'var(--font-mono, monospace)',
        }}
      >
        {code}
      </pre>
    </div>
  )
}

const th: React.CSSProperties = { padding: '6px 10px', fontWeight: 500 }
const td: React.CSSProperties = { padding: '7px 10px', verticalAlign: 'top' }

const inlineCode: React.CSSProperties = {
  fontFamily: 'var(--font-mono, monospace)',
  background: 'var(--surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 6,
  padding: '2px 6px',
  fontSize: '0.92em',
}

const scopePill: React.CSSProperties = {
  fontSize: 11.5,
  padding: '4px 9px',
  borderRadius: 20,
  fontFamily: 'var(--font-mono, monospace)',
  border: '1px solid var(--border-subtle)',
  background: 'var(--surface)',
  color: 'var(--foreground-secondary)',
}

function capabilityPill(minPlan: string): React.CSSProperties {
  const gated = minPlan !== 'free'
  return {
    fontSize: 11,
    padding: '3px 8px',
    borderRadius: 6,
    fontFamily: 'var(--font-mono, monospace)',
    border: `1px solid ${gated ? 'rgba(245,158,11,0.3)' : 'var(--border-subtle)'}`,
    background: gated ? 'rgba(245,158,11,0.08)' : 'var(--surface)',
    color: gated ? '#f59e0b' : 'var(--foreground-secondary)',
  }
}
