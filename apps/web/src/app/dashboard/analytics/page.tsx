'use client'

import { useState } from 'react'

const MOCK_DAILY = [
  { day: 'Mon', actions: 24, tokens: 12400, cost: 0.018 },
  { day: 'Tue', actions: 38, tokens: 19800, cost: 0.029 },
  { day: 'Wed', actions: 31, tokens: 15200, cost: 0.022 },
  { day: 'Thu', actions: 52, tokens: 28100, cost: 0.042 },
  { day: 'Fri', actions: 45, tokens: 23700, cost: 0.035 },
  { day: 'Sat', actions: 18, tokens: 8900, cost: 0.013 },
  { day: 'Sun', actions: 12, tokens: 6200, cost: 0.009 },
]

const TASK_BREAKDOWN = [
  { task: 'Smart Paste', count: 87, pct: 38 },
  { task: 'Summarize', count: 54, pct: 24 },
  { task: 'Extract Data', count: 43, pct: 19 },
  { task: 'Generate Reply', count: 28, pct: 12 },
  { task: 'Translate', count: 16, pct: 7 },
]

const maxActions = Math.max(...MOCK_DAILY.map((d) => d.actions))

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('7d')

  const totalActions = MOCK_DAILY.reduce((a, d) => a + d.actions, 0)
  const totalTokens = MOCK_DAILY.reduce((a, d) => a + d.tokens, 0)
  const totalCost = MOCK_DAILY.reduce((a, d) => a + d.cost, 0)
  const cacheHitRate = 0.34

  return (
    <div className="p-8 space-y-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Analytics</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--foreground-secondary)' }}>
            AI usage, token costs, and productivity metrics
          </p>
        </div>
        <div className="flex gap-1 glass rounded-lg p-1">
          {(['7d', '30d', '90d'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className="px-3 py-1.5 rounded-md text-xs font-heading font-semibold transition-all"
              style={{
                background: period === p ? 'var(--surface-active)' : 'transparent',
                color: period === p ? 'var(--foreground)' : 'var(--foreground-tertiary)',
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Actions', value: totalActions, suffix: '', color: 'var(--indigo-light)' },
          { label: 'Tokens Used', value: (totalTokens / 1000).toFixed(1) + 'k', suffix: '', color: 'var(--cyan)' },
          { label: 'AI Cost', value: `$${totalCost.toFixed(3)}`, suffix: '', color: '#f59e0b' },
          { label: 'Cache Hit Rate', value: `${(cacheHitRate * 100).toFixed(0)}%`, suffix: ' savings', color: '#10b981' },
        ].map((card, i) => (
          <div key={i} className="glass rounded-xl p-5">
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--foreground-tertiary)' }}>
              {card.label}
            </p>
            <p className="text-2xl font-heading font-bold" style={{ color: card.color }}>
              {card.value}
              {card.suffix && (
                <span className="text-xs ml-1" style={{ color: 'var(--foreground-tertiary)' }}>
                  {card.suffix}
                </span>
              )}
            </p>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Bar Chart - Actions */}
        <div className="lg:col-span-2 glass rounded-xl p-6">
          <h2 className="font-heading font-semibold text-sm mb-5" style={{ color: 'var(--foreground-secondary)' }}>
            DAILY ACTIONS
          </h2>
          <div className="flex items-end gap-3 h-36">
            {MOCK_DAILY.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                <p className="text-xs font-mono" style={{ color: 'var(--foreground-tertiary)' }}>
                  {d.actions}
                </p>
                <div
                  className="w-full rounded-t-sm transition-all"
                  style={{
                    height: `${(d.actions / maxActions) * 100}%`,
                    background: 'linear-gradient(to top, rgba(99,102,241,0.6), rgba(34,211,238,0.4))',
                    minHeight: '4px',
                  }}
                />
                <p className="text-xs" style={{ color: 'var(--foreground-tertiary)' }}>
                  {d.day}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Task Breakdown */}
        <div className="glass rounded-xl p-6">
          <h2 className="font-heading font-semibold text-sm mb-5" style={{ color: 'var(--foreground-secondary)' }}>
            TASK BREAKDOWN
          </h2>
          <div className="space-y-3.5">
            {TASK_BREAKDOWN.map((item, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-heading text-foreground">{item.task}</p>
                  <p className="text-xs font-mono" style={{ color: 'var(--foreground-secondary)' }}>
                    {item.count}
                  </p>
                </div>
                <div className="h-1.5 rounded-full" style={{ background: 'var(--surface-hover)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${item.pct}%`,
                      background: 'var(--gradient-brand)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Token Cost Table */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="font-heading font-semibold text-sm" style={{ color: 'var(--foreground-secondary)' }}>
            TOKEN USAGE BY DAY
          </h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Day', 'Actions', 'Tokens', 'Cost', 'Cached', 'Net Cost'].map((h) => (
                <th
                  key={h}
                  className="px-6 py-3 text-left text-xs font-heading font-semibold"
                  style={{ color: 'var(--foreground-tertiary)' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MOCK_DAILY.map((d, i) => {
              const cached = Math.floor(d.tokens * cacheHitRate)
              const net = d.cost * (1 - cacheHitRate)
              return (
                <tr
                  key={i}
                  style={{ borderBottom: i < MOCK_DAILY.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}
                >
                  <td className="px-6 py-3 font-heading text-foreground">{d.day}</td>
                  <td className="px-6 py-3 font-mono text-foreground">{d.actions}</td>
                  <td className="px-6 py-3 font-mono text-foreground">{d.tokens.toLocaleString()}</td>
                  <td className="px-6 py-3 font-mono text-foreground">${d.cost.toFixed(3)}</td>
                  <td className="px-6 py-3 font-mono" style={{ color: '#10b981' }}>
                    {(cacheHitRate * 100).toFixed(0)}%
                  </td>
                  <td className="px-6 py-3 font-mono" style={{ color: 'var(--cyan)' }}>
                    ${net.toFixed(3)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
