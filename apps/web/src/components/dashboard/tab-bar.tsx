'use client'

/**
 * Segmented control used across dashboard pages.
 *
 * Lives here rather than in a page module because a Next.js page may only
 * export `default` and route segment config — any other export fails the
 * production build.
 */
export function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: string; label: string }>
  active: string
  onChange: (id: string) => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 3,
        padding: 3,
        background: 'var(--surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 10,
        width: 'fit-content',
        marginBottom: 22,
      }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          aria-pressed={active === tab.id}
          style={{
            padding: '6px 14px',
            borderRadius: 7,
            fontSize: 13,
            fontWeight: 500,
            border: 'none',
            cursor: 'pointer',
            background: active === tab.id ? 'var(--surface-active)' : 'transparent',
            color: active === tab.id ? 'var(--foreground)' : 'var(--foreground-tertiary)',
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export default TabBar
