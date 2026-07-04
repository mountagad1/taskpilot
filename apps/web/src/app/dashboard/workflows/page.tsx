'use client'

import { useState } from 'react'

const WORKFLOW_TEMPLATES = [
  {
    icon: '👤',
    name: 'LinkedIn Lead Capture',
    desc: 'Extract contact info from LinkedIn profiles → push to HubSpot CRM',
    steps: ['Visit LinkedIn profile', 'Extract contact data', 'Push to HubSpot'],
    tags: ['CRM', 'Lead Gen'],
    uses: 847,
  },
  {
    icon: '📰',
    name: 'Article to Notion',
    desc: 'Read any article → AI summary → create Notion page with tags',
    steps: ['Open article', 'AI summarize', 'Create Notion page'],
    tags: ['Research', 'Notion'],
    uses: 612,
  },
  {
    icon: '🛒',
    name: 'E-commerce Price Tracker',
    desc: 'Extract product prices across competitor sites → export to Excel',
    steps: ['Visit product pages', 'Extract prices', 'Export to Excel'],
    tags: ['E-commerce', 'Analytics'],
    uses: 423,
  },
  {
    icon: '📧',
    name: 'Email Reply Assistant',
    desc: 'Detect email thread context → generate professional reply draft',
    steps: ['Read email thread', 'Analyze tone/context', 'Generate reply'],
    tags: ['Email', 'Communication'],
    uses: 1204,
  },
]

export default function WorkflowsPage() {
  const [tab, setTab] = useState<'my' | 'templates'>('templates')

  return (
    <div className="p-8 space-y-8 max-w-5xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Workflows</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--foreground-secondary)' }}>
            Automate multi-step browser tasks with AI
          </p>
        </div>
        <button className="btn btn-primary px-4 py-2 text-sm">
          + New Workflow
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 glass rounded-lg p-1 w-fit">
        {(['templates', 'my'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-2 rounded-md text-sm font-heading font-semibold transition-all capitalize"
            style={{
              background: tab === t ? 'var(--surface-active)' : 'transparent',
              color: tab === t ? 'var(--foreground)' : 'var(--foreground-tertiary)',
            }}
          >
            {t === 'my' ? 'My Workflows' : 'Templates'}
          </button>
        ))}
      </div>

      {tab === 'templates' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {WORKFLOW_TEMPLATES.map((wf, i) => (
            <div key={i} className="glass glass-hover rounded-xl p-5">
              <div className="flex items-start gap-4">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-xl flex-shrink-0"
                  style={{ background: 'var(--surface-hover)' }}
                >
                  {wf.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-heading font-semibold text-sm text-foreground mb-1">
                    {wf.name}
                  </p>
                  <p className="text-xs mb-3" style={{ color: 'var(--foreground-secondary)' }}>
                    {wf.desc}
                  </p>

                  {/* Steps */}
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    {wf.steps.map((step, si) => (
                      <div key={si} className="flex items-center gap-1.5">
                        <span
                          className="text-xs px-2 py-0.5 rounded"
                          style={{
                            background: 'var(--surface)',
                            color: 'var(--foreground-secondary)',
                            border: '1px solid var(--border)',
                          }}
                        >
                          {step}
                        </span>
                        {si < wf.steps.length - 1 && (
                          <span style={{ color: 'var(--foreground-tertiary)', fontSize: 10 }}>→</span>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                      {wf.tags.map((tag, ti) => (
                        <span
                          key={ti}
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{
                            background: 'rgba(99,102,241,0.12)',
                            color: 'var(--indigo-light)',
                            border: '1px solid rgba(99,102,241,0.2)',
                            fontFamily: 'var(--font-heading)',
                            fontWeight: 600,
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--foreground-tertiary)' }}>
                      {wf.uses.toLocaleString()} uses
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t flex justify-end gap-2" style={{ borderColor: 'var(--border-subtle)' }}>
                <button
                  className="text-xs px-3 py-1.5 rounded-lg font-heading font-semibold"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--foreground-secondary)' }}
                >
                  Preview
                </button>
                <button
                  className="text-xs px-3 py-1.5 rounded-lg font-heading font-semibold"
                  style={{ background: 'var(--gradient-brand)', color: 'white' }}
                >
                  Use Template
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          className="flex flex-col items-center justify-center py-20 text-center glass rounded-xl"
        >
          <div className="text-4xl mb-4">⚡</div>
          <p className="font-heading font-bold text-foreground mb-2">No workflows yet</p>
          <p className="text-sm mb-6" style={{ color: 'var(--foreground-secondary)' }}>
            Create your first automation workflow or start from a template
          </p>
          <button className="btn btn-primary px-5 py-2.5 text-sm">
            + Create Workflow
          </button>
        </div>
      )}
    </div>
  )
}
