'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { notifyExtensionSignedOut } from '@/lib/extension-bridge'
import {
  IconGrid, IconZap, IconSidebar, IconBot, IconWorkflow,
  IconChart, IconPlug, IconSettings, IconCrown, IconLogout, IconLogo, IconStar,
} from '@/components/ui/icons'

const NAV_SECTIONS: { label: string; items: { href: string; label: string; icon: React.ReactNode }[] }[] = [
  {
    label: 'Product',
    items: [
      { href: '/dashboard', label: 'Overview', icon: <IconGrid size={17} /> },
      { href: '/dashboard/smart-paste', label: 'Smart Paste', icon: <IconZap size={17} /> },
      { href: '/dashboard/sidebar', label: 'AI Sidebar', icon: <IconSidebar size={17} /> },
      { href: '/dashboard/actions', label: 'Browser Actions', icon: <IconBot size={17} /> },
    ],
  },
  {
    label: 'Manage',
    items: [
      { href: '/dashboard/workflows', label: 'Workflows', icon: <IconWorkflow size={17} /> },
      { href: '/dashboard/marketplace', label: 'Marketplace', icon: <IconStar size={17} /> },
      { href: '/dashboard/analytics', label: 'Analytics', icon: <IconChart size={17} /> },
      { href: '/dashboard/integrations', label: 'Integrations', icon: <IconPlug size={17} /> },
      { href: '/dashboard/settings', label: 'Settings', icon: <IconSettings size={17} /> },
    ],
  },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClientComponentClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    notifyExtensionSignedOut()
    router.push('/')
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '236px 1fr', minHeight: '100vh' }}>
      <aside
        style={{
          background: 'var(--background-secondary)',
          borderRight: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          position: 'sticky',
          top: 0,
          height: '100vh',
        }}
      >
        {/* Logo */}
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', color: 'var(--foreground)' }}>
            <span style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: 'var(--shadow-accent)' }}>
              <IconLogo size={15} />
            </span>
            <span style={{ fontSize: 14.5, fontWeight: 600, letterSpacing: '-0.02em' }}>TaskPilot</span>
          </Link>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: 12, overflowY: 'auto' }} className="no-scrollbar">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} style={{ marginBottom: 16 }}>
              <div style={{ padding: '0 10px 6px', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--foreground-muted)' }}>
                {section.label}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {section.items.map((item) => {
                  const active = pathname === item.href
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '7px 10px',
                        borderRadius: 8,
                        fontSize: 13.5,
                        fontWeight: active ? 550 : 450,
                        textDecoration: 'none',
                        background: active ? 'var(--surface-active)' : 'transparent',
                        color: active ? 'var(--foreground)' : 'var(--foreground-secondary)',
                        transition: 'background 140ms var(--ease), color 140ms var(--ease)',
                      }}
                      className="dash-nav-link"
                    >
                      <span style={{ display: 'flex', color: active ? 'var(--indigo-light)' : 'var(--foreground-tertiary)' }}>{item.icon}</span>
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div style={{ padding: 12, borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Link
            href="/dashboard/settings"
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8, fontSize: 13.5, fontWeight: 450, textDecoration: 'none', color: 'var(--foreground-secondary)' }}
            className="dash-nav-link"
          >
            <span style={{ display: 'flex', color: 'var(--warning)' }}><IconCrown size={17} /></span>
            Upgrade to Pro
          </Link>
          <button
            onClick={handleSignOut}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8, fontSize: 13.5, fontWeight: 450, background: 'transparent', border: 'none', color: 'var(--foreground-tertiary)', cursor: 'pointer', width: '100%', textAlign: 'left' }}
            className="dash-nav-link"
          >
            <span style={{ display: 'flex' }}><IconLogout size={17} /></span>
            Sign out
          </button>
        </div>
      </aside>

      <main style={{ background: 'var(--background)', overflowY: 'auto' }}>{children}</main>

      <style>{`.dash-nav-link:hover { background: var(--surface); color: var(--foreground); }`}</style>
    </div>
  )
}
