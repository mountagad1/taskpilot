'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview', icon: '⬡' },
  // ── Product ──
  { href: '/dashboard/smart-paste', label: 'Smart Paste', icon: '⚡' },
  { href: '/dashboard/sidebar', label: 'AI Sidebar', icon: '✦' },
  { href: '/dashboard/actions', label: 'Browser Actions', icon: '⚙' },
  // ── Manage ──
  { href: '/dashboard/workflows', label: 'Workflows', icon: '◇' },
  { href: '/dashboard/analytics', label: 'Analytics', icon: '📊' },
  { href: '/dashboard/integrations', label: 'Integrations', icon: '🔗' },
  { href: '/dashboard/settings', label: 'Settings', icon: '⚙' },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClientComponentClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside
        style={{
          background: 'var(--background-secondary)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          position: 'sticky',
          top: 0,
          height: '100vh',
        }}
      >
        {/* Logo */}
        <div className="p-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <Link href="/" className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold"
              style={{ background: 'var(--gradient-brand)' }}
            >
              ✦
            </div>
            <span className="font-heading font-bold text-sm text-foreground">TaskPilot</span>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all"
                style={{
                  background: active ? 'var(--surface-active)' : 'transparent',
                  color: active ? 'var(--foreground)' : 'var(--foreground-secondary)',
                  fontFamily: 'var(--font-heading)',
                  fontWeight: active ? '600' : '400',
                  borderLeft: active ? '2px solid var(--indigo)' : '2px solid transparent',
                }}
              >
                <span className="text-base w-5 text-center">{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t space-y-1" style={{ borderColor: 'var(--border)' }}>
          <Link
            href="/dashboard/settings"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all hover:bg-surface"
            style={{ color: 'var(--foreground-secondary)', fontFamily: 'var(--font-heading)', fontWeight: 500 }}
          >
            <span className="w-5 text-center">💎</span>
            Upgrade to Pro
          </Link>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all hover:bg-surface"
            style={{ color: 'var(--foreground-tertiary)', fontFamily: 'var(--font-heading)', fontWeight: 500 }}
          >
            <span className="w-5 text-center">↩</span>
            Sign out
          </button>
        </div>
      </aside>

      {/* Content */}
      <main style={{ background: 'var(--background)', overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  )
}
