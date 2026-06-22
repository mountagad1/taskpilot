'use client'

const INTEGRATIONS = [
  {
    name: 'HubSpot',
    category: 'CRM',
    icon: '🟠',
    desc: 'Push leads, contacts, and companies directly to HubSpot.',
    status: 'available',
    plan: 'pro',
  },
  {
    name: 'Salesforce',
    category: 'CRM',
    icon: '☁️',
    desc: 'Sync extracted data to Salesforce leads and opportunities.',
    status: 'coming_soon',
    plan: 'pro',
  },
  {
    name: 'Notion',
    category: 'Productivity',
    icon: '⬛',
    desc: 'Create Notion pages from summarized content.',
    status: 'available',
    plan: 'pro',
  },
  {
    name: 'Airtable',
    category: 'Database',
    icon: '🟡',
    desc: 'Add extracted records directly to Airtable bases.',
    status: 'coming_soon',
    plan: 'pro',
  },
  {
    name: 'Slack',
    category: 'Communication',
    icon: '💬',
    desc: 'Send AI summaries and alerts to Slack channels.',
    status: 'coming_soon',
    plan: 'pro',
  },
  {
    name: 'Google Sheets',
    category: 'Spreadsheet',
    icon: '📊',
    desc: 'Export scraped data directly to Google Sheets.',
    status: 'coming_soon',
    plan: 'pro',
  },
  {
    name: 'Zapier',
    category: 'Automation',
    icon: '⚡',
    desc: 'Trigger Zaps from TaskPilot browser actions.',
    status: 'coming_soon',
    plan: 'enterprise',
  },
  {
    name: 'Make (Integromat)',
    category: 'Automation',
    icon: '🔵',
    desc: 'Connect TaskPilot events to 1,000+ apps via Make.',
    status: 'coming_soon',
    plan: 'enterprise',
  },
]

const PLAN_COLOR: Record<string, string> = {
  pro: 'var(--indigo-light)',
  enterprise: 'var(--cyan)',
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  available: { label: 'Available', color: '#10b981' },
  coming_soon: { label: 'Coming soon', color: 'var(--foreground-tertiary)' },
}

export default function IntegrationsPage() {
  return (
    <div className="p-8 space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Integrations</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--foreground-secondary)' }}>
          Connect TaskPilot to your existing tools and workflows
        </p>
      </div>

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
        {INTEGRATIONS.map((intg, i) => {
          const status = STATUS_LABEL[intg.status]
          return (
            <div
              key={i}
              className="glass rounded-xl p-5 flex items-start gap-4"
              style={{
                opacity: intg.status === 'coming_soon' ? 0.65 : 1,
              }}
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-xl flex-shrink-0"
                style={{ background: 'var(--surface-hover)' }}
              >
                {intg.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-heading font-semibold text-sm text-foreground">
                    {intg.name}
                  </p>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{
                      background: 'var(--surface-hover)',
                      color: 'var(--foreground-tertiary)',
                      fontFamily: 'var(--font-heading)',
                      fontSize: '10px',
                    }}
                  >
                    {intg.category}
                  </span>
                </div>
                <p className="text-xs mb-3" style={{ color: 'var(--foreground-secondary)' }}>
                  {intg.desc}
                </p>
                <div className="flex items-center justify-between">
                  <span style={{ fontSize: '11px', color: status.color, fontWeight: 600 }}>
                    ● {status.label}
                  </span>
                  {intg.status === 'available' ? (
                    <button
                      className="text-xs px-3 py-1.5 rounded-md font-heading font-semibold transition-all"
                      style={{
                        background: 'var(--gradient-brand)',
                        color: 'white',
                        fontSize: '11px',
                      }}
                    >
                      Connect
                    </button>
                  ) : (
                    <span
                      className="text-xs px-3 py-1.5 rounded-md"
                      style={{
                        background: 'var(--surface)',
                        color: PLAN_COLOR[intg.plan] || 'var(--foreground-tertiary)',
                        fontFamily: 'var(--font-heading)',
                        fontWeight: 600,
                        fontSize: '10px',
                        border: '1px solid var(--border)',
                      }}
                    >
                      {intg.plan === 'enterprise' ? 'Enterprise' : 'Pro'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* API access */}
      <div className="glass rounded-xl p-6">
        <h2 className="font-heading font-semibold text-sm mb-2 text-foreground">
          REST API Access
        </h2>
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
          POST https://taskpilot.cc/api/ai/process<br />
          Authorization: Bearer YOUR_API_KEY<br />
          {"{"} task: 'summarize', pageContext: {"{ url, content }"} {"}"}
        </code>
      </div>
    </div>
  )
}
