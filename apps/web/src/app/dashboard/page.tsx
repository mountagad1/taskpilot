'use client'

import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

const stats = [
  { label: 'AI Actions Today', value: '—', key: 'today_actions', suffix: '' },
  { label: 'Hours Saved', value: '—', key: 'hours_saved', suffix: 'h' },
  { label: 'Forms Autofilled', value: '—', key: 'forms_filled', suffix: '' },
  { label: 'This Month', value: '—', key: 'monthly_actions', suffix: ' actions' },
]

const quickActions = [
  { icon: '⚡', label: 'Smart Paste', desc: 'Install extension to use' },
  { icon: '🧠', label: 'AI Sidebar', desc: 'Chat with any webpage' },
  { icon: '📊', label: 'Export Data', desc: 'CSV, Excel, PDF' },
  { icon: '🔗', label: 'Integrations', desc: 'HubSpot, Notion, Slack' },
]

const recentActivity = [
  { icon: '⚡', action: 'Smart Paste', target: 'HubSpot — contact form', time: '2 min ago', status: 'success' },
  { icon: '📄', action: 'Summarize', target: 'TechCrunch article', time: '15 min ago', status: 'success' },
  { icon: '📊', action: 'Extract Data', target: 'LinkedIn company page', time: '1h ago', status: 'success' },
  { icon: '✍️', action: 'Rewrite', target: 'Email draft', time: '3h ago', status: 'success' },
]

export default function DashboardPage() {
  const [user, setUser] = useState<{ email?: string; full_name?: string; plan?: string } | null>(null)
  const [metrics, setMetrics] = useState(stats)
  const supabase = createClientComponentClient()

  useEffect(() => {
    const loadData = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, plan')
        .eq('id', authUser.id)
        .single()

      setUser({ email: authUser.email, ...profile })

      // Load metrics
      const { data: metricsData } = await supabase
        .from('productivity_metrics')
        .select('*')
        .eq('user_id', authUser.id)
        .order('date', { ascending: false })
        .limit(30)

      if (metricsData?.length) {
        const total = metricsData.reduce((acc, d) => acc + (d.actions_completed || 0), 0)
        const today = metricsData[0]?.actions_completed || 0
        const hours = metricsData.reduce((acc, d) => acc + (d.time_saved_minutes || 0), 0) / 60

        setMetrics([
          { ...stats[0], value: String(today) },
          { ...stats[1], value: hours.toFixed(1) },
          { ...stats[2], value: String(metricsData.reduce((a, d) => a + (d.forms_filled || 0), 0)) },
          { ...stats[3], value: String(total) },
        ])
      }
    }

    loadData()
  }, [])

  const firstName = user?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'there'

  return (
    <div className="p-8 space-y-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">
            Good morning, {firstName} 👋
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--foreground-secondary)' }}>
            Your AI browser workspace is ready
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="badge badge-indigo text-xs">
            {user?.plan === 'pro' ? '⚡ Pro' : '🆓 Free'}
          </span>
          {user?.plan !== 'pro' && (
            <button className="btn btn-primary text-sm px-4 py-2">
              Upgrade to Pro
            </button>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((stat, i) => (
          <div
            key={i}
            className="glass glass-hover rounded-xl p-5"
          >
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--foreground-tertiary)' }}>
              {stat.label}
            </p>
            <p className="text-2xl font-heading font-bold text-foreground">
              {stat.value}
              <span className="text-sm font-normal ml-0.5" style={{ color: 'var(--foreground-secondary)' }}>
                {stat.suffix}
              </span>
            </p>
          </div>
        ))}
      </div>

      {/* Install Extension Banner */}
      <div
        className="rounded-xl p-5 flex items-center justify-between"
        style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(34,211,238,0.06) 100%)',
          border: '1px solid rgba(99,102,241,0.25)',
        }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
            style={{ background: 'rgba(99,102,241,0.2)' }}
          >
            🧩
          </div>
          <div>
            <p className="font-heading font-semibold text-sm text-foreground">
              Install the Chrome Extension
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--foreground-secondary)' }}>
              Enable Smart Paste, AI Sidebar, and Browser Actions on every webpage
            </p>
          </div>
        </div>
        <button className="btn btn-primary text-sm px-5 py-2 whitespace-nowrap">
          Add to Chrome →
        </button>
      </div>

      {/* Quick Actions + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Quick Actions */}
        <div className="glass rounded-xl p-6">
          <h2 className="font-heading font-semibold text-sm mb-4" style={{ color: 'var(--foreground-secondary)' }}>
            QUICK ACTIONS
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {quickActions.map((action, i) => (
              <button
                key={i}
                className="glass glass-hover rounded-lg p-4 text-left transition-all group"
              >
                <div className="text-xl mb-2">{action.icon}</div>
                <p className="font-heading font-semibold text-sm text-foreground">
                  {action.label}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--foreground-tertiary)' }}>
                  {action.desc}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="glass rounded-xl p-6">
          <h2 className="font-heading font-semibold text-sm mb-4" style={{ color: 'var(--foreground-secondary)' }}>
            RECENT ACTIVITY
          </h2>
          <div className="space-y-3">
            {recentActivity.map((item, i) => (
              <div key={i} className="flex items-center gap-3 py-2">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                  style={{ background: 'var(--surface-hover)' }}
                >
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {item.action}
                  </p>
                  <p className="text-xs truncate" style={{ color: 'var(--foreground-tertiary)' }}>
                    {item.target}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <p className="text-xs" style={{ color: 'var(--foreground-tertiary)' }}>
                    {item.time}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
