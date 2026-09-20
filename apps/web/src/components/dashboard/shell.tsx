'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { signOut } from '@/lib/client/auth'
import { notifyExtensionSignedOut } from '@/lib/extension-bridge'
import { PRICING_URL } from '@/lib/links'
import NotificationBell from '@/components/dashboard/notifications'
import { useAuth } from '@/components/dashboard/auth-context'
import {
  IconGrid, IconZap, IconSidebar, IconBot, IconWorkflow,
  IconChart, IconPlug, IconSettings, IconCrown, IconLogout, IconLogo, IconStar,
  IconMenu, IconX,
} from '@/components/ui/icons'

const NAV_SECTIONS: { label: string; items: { href: string; label: string; icon: React.ReactNode }[] }[] = [
  {
    label: 'Automate',
    items: [
      { href: '/dashboard', label: 'Overview', icon: <IconGrid size={17} /> },
      { href: '/dashboard/runs', label: 'Runs', icon: <IconBot size={17} /> },
      { href: '/dashboard/agents', label: 'Agent studio', icon: <IconZap size={17} /> },
      { href: '/dashboard/workflows', label: 'Workflows', icon: <IconWorkflow size={17} /> },
    ],
  },
  {
    label: 'Product',
    items: [
      { href: '/dashboard/smart-paste', label: 'Smart Paste', icon: <IconZap size={17} /> },
      { href: '/dashboard/sidebar', label: 'AI Sidebar', icon: <IconSidebar size={17} /> },
      { href: '/dashboard/actions', label: 'Browser Actions', icon: <IconBot size={17} /> },
    ],
  },
  {
    label: 'Manage',
    items: [
      { href: '/dashboard/marketplace', label: 'Marketplace', icon: <IconStar size={17} /> },
      { href: '/dashboard/teams', label: 'Teams', icon: <IconPlug size={17} /> },
      { href: '/dashboard/analytics', label: 'Analytics', icon: <IconChart size={17} /> },
      { href: '/dashboard/developers', label: 'Developers', icon: <IconPlug size={17} /> },
      { href: '/dashboard/integrations', label: 'Integrations', icon: <IconPlug size={17} /> },
      { href: '/dashboard/settings', label: 'Settings', icon: <IconSettings size={17} /> },
    ],
  },
]

// Below this, the sidebar becomes an off-canvas drawer instead of a
// permanent column. Matches the drawer breakpoint already used on the
// marketing nav (apps/web/src/app/page.tsx) so the product feels consistent
// at the same widths.
const MOBILE_BREAKPOINT = '860px'

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  // Safe because the dashboard layout renders this inside RequireAuth,
  // which resolves the session and supplies the provider before any child
  // mounts. Rendered anywhere else, `useAuth` throws.
  const { email, plan } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Never let a drawer survive a navigation — the next page should always
  // start with it closed, on both the link click and the back button.
  useEffect(() => setDrawerOpen(false), [pathname])

  // Body scroll lock while the drawer covers the screen, and Escape to
  // close — a drawer that traps scroll but not the Escape key is a common
  // half-finished pattern.
  useEffect(() => {
    if (!drawerOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [drawerOpen])

  const handleSignOut = async () => {
    await signOut()
    notifyExtensionSignedOut()
    router.push('/')
  }

  return (
    <div className="dash-shell">
      {/* Mobile-only compact header. Hidden entirely at the desktop
          breakpoint, where the sidebar is always visible instead. */}
      <header className="dash-mobile-header">
        <button
          type="button"
          className="dash-mobile-header-btn"
          aria-label="Open navigation"
          aria-expanded={drawerOpen}
          aria-controls="dash-sidebar"
          onClick={() => setDrawerOpen(true)}
        >
          <IconMenu size={20} />
        </button>
        <Link href="/dashboard" className="dash-logo" style={{ textDecoration: 'none', color: 'var(--foreground)' }}>
          <span className="dash-logo-mark"><IconLogo size={14} /></span>
          <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.02em' }}>TaskPilot</span>
        </Link>
        <div className="dash-mobile-header-bell">
          <NotificationBell />
        </div>
      </header>

      {/* Backdrop — mobile only, only rendered while open so it never sits
          in the tab order or paints when unused. */}
      {drawerOpen && (
        <div className="dash-backdrop" aria-hidden="true" onClick={() => setDrawerOpen(false)} />
      )}

      <aside
        id="dash-sidebar"
        className={`dash-sidebar${drawerOpen ? ' dash-sidebar-open' : ''}`}
        role="dialog"
        aria-modal={drawerOpen ? true : undefined}
        aria-label="Dashboard navigation"
      >
        {/* Logo — desktop only; the mobile header carries its own. */}
        <div className="dash-sidebar-head">
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', color: 'var(--foreground)' }}>
            <span className="dash-logo-mark"><IconLogo size={15} /></span>
            <span style={{ fontSize: 14.5, fontWeight: 600, letterSpacing: '-0.02em' }}>TaskPilot</span>
          </Link>
          <button
            type="button"
            className="dash-sidebar-close"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
          >
            <IconX size={18} />
          </button>
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
          {email && (
            <div
              title={email}
              style={{ padding: '4px 10px 8px', fontSize: 12, color: 'var(--foreground-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {email}
              <span style={{ marginLeft: 6, textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.06em', color: 'var(--indigo-light)' }}>{plan}</span>
            </div>
          )}
          {plan === 'free' && (
            <a href={PRICING_URL} className="dash-nav-link" style={{ display: 'flex', alignItems: 'center', gap: 10, borderRadius: 8, fontSize: 13.5, fontWeight: 450, textDecoration: 'none', color: 'var(--foreground-secondary)' }}>
              <span style={{ display: 'flex', color: 'var(--warning)' }}><IconCrown size={17} /></span>
              Upgrade to Pro
            </a>
          )}
          <button
            onClick={handleSignOut}
            className="dash-nav-link"
            style={{ display: 'flex', alignItems: 'center', gap: 10, borderRadius: 8, fontSize: 13.5, fontWeight: 450, background: 'transparent', border: 'none', color: 'var(--foreground-tertiary)', cursor: 'pointer', width: '100%', textAlign: 'left' }}
          >
            <span style={{ display: 'flex' }}><IconLogout size={17} /></span>
            Sign out
          </button>
        </div>
      </aside>

      <main className="dash-main">
        {/* Floats above page content so every dashboard page gets the bell
            without having to render it itself. Desktop only — the mobile
            header carries its own copy so it isn't hidden behind content
            that scrolls underneath it. */}
        <div className="dash-desktop-bell">
          <NotificationBell />
        </div>
        {children}
      </main>

      <style>{`
        .dash-shell {
          display: grid;
          grid-template-columns: 1fr;
          grid-template-rows: auto 1fr;
          min-height: 100vh;
          min-height: 100dvh;
        }
        .dash-nav-link { padding: 10px 12px; }
        .dash-nav-link:hover { background: var(--surface); color: var(--foreground); }

        .dash-mobile-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: max(10px, env(safe-area-inset-top)) 14px 10px;
          background: var(--background-secondary);
          border-bottom: 1px solid var(--border-subtle);
          position: sticky;
          top: 0;
          z-index: 30;
        }
        .dash-mobile-header-btn {
          display: flex; align-items: center; justify-content: center;
          width: 40px; height: 40px; flex-shrink: 0;
          background: transparent; border: none; border-radius: 8px;
          color: var(--foreground-secondary); cursor: pointer;
        }
        .dash-mobile-header-btn:hover { background: var(--surface); }
        .dash-logo { display: flex; align-items: center; gap: 9px; flex: 1; min-width: 0; }
        .dash-logo-mark {
          width: 26px; height: 26px; border-radius: 7px; flex-shrink: 0;
          background: var(--gradient-brand); display: flex; align-items: center;
          justify-content: center; color: #fff; box-shadow: var(--shadow-accent);
        }
        .dash-mobile-header-bell { flex-shrink: 0; }
        .dash-desktop-bell { display: none; }

        .dash-backdrop {
          position: fixed; inset: 0; background: rgba(0,0,0,0.5);
          z-index: 39; animation: dash-fade 140ms var(--ease, ease-out);
        }
        @keyframes dash-fade { from { opacity: 0 } to { opacity: 1 } }

        .dash-sidebar-close { display: flex; }
        .dash-sidebar-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 12px 14px 18px; border-bottom: 1px solid var(--border-subtle);
        }
        .dash-sidebar-close {
          align-items: center; justify-content: center;
          width: 40px; height: 40px; background: transparent; border: none;
          border-radius: 8px; color: var(--foreground-tertiary); cursor: pointer;
        }
        .dash-sidebar-close:hover { background: var(--surface); color: var(--foreground); }

        .dash-sidebar {
          background: var(--background-secondary);
          border-right: 1px solid var(--border-subtle);
          display: flex; flex-direction: column;
          position: fixed; top: 0; bottom: 0; left: 0;
          width: min(300px, 84vw);
          transform: translateX(-100%);
          transition: transform 200ms var(--ease, ease-out);
          z-index: 40;
          padding-bottom: env(safe-area-inset-bottom);
        }
        .dash-sidebar-open { transform: translateX(0); }

        .dash-main {
          background: var(--background);
          overflow-y: auto;
          overflow-x: hidden;
          position: relative;
          min-width: 0;
        }

        @media (min-width: ${MOBILE_BREAKPOINT}) {
          .dash-shell { grid-template-columns: 236px 1fr; grid-template-rows: 1fr; }
          .dash-mobile-header, .dash-backdrop { display: none; }
          .dash-sidebar {
            position: sticky; top: 0; height: 100vh; transform: none;
            width: auto; z-index: auto;
          }
          .dash-sidebar-close { display: none; }
          .dash-desktop-bell { display: block; position: absolute; top: 18px; right: 26px; z-index: 40; }
          .dash-nav-link { padding: 7px 10px; }
        }
      `}</style>
    </div>
  )
}
