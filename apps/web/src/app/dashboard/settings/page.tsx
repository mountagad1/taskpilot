'use client'

import { useState } from 'react'

export default function SettingsPage() {
  const [saved, setSaved] = useState(false)
  const [settings, setSettings] = useState({
    smartPasteAnimations: true,
    autoDetectForms: true,
    sidebarPosition: 'right',
    defaultLanguage: 'en',
    exportFormat: 'csv',
    cacheEnabled: true,
    keyboardShortcuts: true,
    notificationsEnabled: true,
  })

  const save = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const Toggle = ({ id }: { id: keyof typeof settings }) => (
    <button
      onClick={() => setSettings((s) => ({ ...s, [id]: !s[id] }))}
      className="relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors"
      style={{
        background: settings[id] ? 'var(--indigo)' : 'var(--surface-hover)',
      }}
    >
      <span
        className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform"
        style={{ transform: settings[id] ? 'translateX(16px)' : 'translateX(0)' }}
      />
    </button>
  )

  const Select = ({
    id,
    options,
  }: {
    id: keyof typeof settings
    options: { value: string; label: string }[]
  }) => (
    <select
      value={String(settings[id])}
      onChange={(e) => setSettings((s) => ({ ...s, [id]: e.target.value }))}
      className="text-sm rounded-lg px-3 py-1.5"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        color: 'var(--foreground)',
        fontFamily: 'var(--font-body)',
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )

  const Row = ({
    label,
    desc,
    children,
  }: {
    label: string
    desc?: string
    children: React.ReactNode
  }) => (
    <div className="flex items-center justify-between py-4">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {desc && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--foreground-tertiary)' }}>
            {desc}
          </p>
        )}
      </div>
      {children}
    </div>
  )

  return (
    <div className="p-8 space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Settings</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--foreground-secondary)' }}>
          Configure your TaskPilot experience
        </p>
      </div>

      {/* Extension */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="font-heading font-semibold text-sm text-foreground">Extension Behavior</h2>
        </div>
        <div className="px-6 divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
          <Row label="Smart Paste animations" desc="Highlight fields when autofilling">
            <Toggle id="smartPasteAnimations" />
          </Row>
          <Row label="Auto-detect forms" desc="Show badge when forms are found on page">
            <Toggle id="autoDetectForms" />
          </Row>
          <Row label="Keyboard shortcuts" desc="Alt+V, Alt+S, Alt+K, etc.">
            <Toggle id="keyboardShortcuts" />
          </Row>
          <Row label="Notifications" desc="Toast notifications for actions">
            <Toggle id="notificationsEnabled" />
          </Row>
          <Row label="Sidebar position">
            <Select
              id="sidebarPosition"
              options={[
                { value: 'right', label: 'Right side' },
                { value: 'left', label: 'Left side' },
              ]}
            />
          </Row>
        </div>
      </div>

      {/* AI */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="font-heading font-semibold text-sm text-foreground">AI Preferences</h2>
        </div>
        <div className="px-6 divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
          <Row label="Semantic caching" desc="Reuse AI results for same content (60%+ cost reduction)">
            <Toggle id="cacheEnabled" />
          </Row>
          <Row label="Default language">
            <Select
              id="defaultLanguage"
              options={[
                { value: 'en', label: 'English' },
                { value: 'fr', label: 'Français' },
                { value: 'es', label: 'Español' },
                { value: 'de', label: 'Deutsch' },
                { value: 'pt', label: 'Português' },
                { value: 'ja', label: '日本語' },
              ]}
            />
          </Row>
          <Row label="Default export format">
            <Select
              id="exportFormat"
              options={[
                { value: 'csv', label: 'CSV' },
                { value: 'excel', label: 'Excel (.xlsx)' },
                { value: 'json', label: 'JSON' },
              ]}
            />
          </Row>
        </div>
      </div>

      {/* Account */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="font-heading font-semibold text-sm text-foreground">Account</h2>
        </div>
        <div className="px-6 py-4 space-y-3">
          <button
            className="w-full text-left text-sm py-2.5 px-4 rounded-lg transition-all"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--foreground)',
            }}
          >
            Manage subscription (Stripe Portal) →
          </button>
          <button
            className="w-full text-left text-sm py-2.5 px-4 rounded-lg transition-all"
            style={{
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              color: '#fca5a5',
            }}
          >
            Delete account and all data →
          </button>
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <button
          onClick={save}
          className="btn btn-primary px-6 py-2.5"
        >
          {saved ? '✓ Saved' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}
