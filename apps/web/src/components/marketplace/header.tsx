import Link from 'next/link'
import { IconLogo, IconGrid } from '@/components/ui/icons'

export function MarketplaceHeader() {
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        height: 'var(--nav-height)',
        display: 'flex',
        alignItems: 'center',
        background: 'rgba(8,8,11,0.72)',
        borderBottom: '1px solid var(--border-subtle)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
      }}
    >
      <div className="ui-container mkt-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, minWidth: 0 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', color: 'var(--foreground)', flexShrink: 0 }}>
            <span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: 'var(--shadow-accent)' }}>
              <IconLogo size={16} />
            </span>
            <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em' }}>TaskPilot</span>
          </Link>
          {/* Redundant with the page heading below on narrow screens, where
              the width is better spent on the two actions to the right. */}
          <span className="mkt-header-crumb" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 500, color: 'var(--foreground-secondary)' }}>
            <IconGrid size={15} /> Marketplace
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <Link href="/dashboard/marketplace" className="btn btn-ghost btn-sm">My library</Link>
          <Link href="/dashboard" className="btn btn-secondary btn-sm">Dashboard</Link>
        </div>
      </div>

      <style>{`
        .mkt-header-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        @media (max-width: 480px) {
          .mkt-header-crumb { display: none !important; }
          .mkt-header-row .btn-sm { padding: 0 9px; font-size: 12.5px; }
        }
      `}</style>
    </header>
  )
}
