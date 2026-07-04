import Link from 'next/link'
import { IconLogo, IconArrowRight } from '@/components/ui/icons'

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: 24,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: '30%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          width: 560,
          maxWidth: '120vw',
          height: 340,
          background: 'radial-gradient(ellipse, rgba(109,118,245,0.12) 0%, transparent 66%)',
          pointerEvents: 'none',
        }}
      />
      <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', color: 'var(--foreground)', marginBottom: 40, position: 'relative' }}>
        <span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: 'var(--shadow-accent)' }}>
          <IconLogo size={16} />
        </span>
        <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em' }}>TaskPilot</span>
      </Link>

      <div style={{ fontSize: 'clamp(64px, 12vw, 108px)', fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1, position: 'relative' }} className="gradient-text">
        404
      </div>
      <h1 style={{ marginTop: 12, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', position: 'relative' }}>
        This page took a wrong turn
      </h1>
      <p style={{ marginTop: 10, maxWidth: 380, fontSize: 15, lineHeight: 1.6, color: 'var(--foreground-secondary)', position: 'relative' }}>
        The page you&apos;re looking for doesn&apos;t exist or has moved. Let&apos;s get you back on track.
      </p>
      <div style={{ marginTop: 26, display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', position: 'relative' }}>
        <Link href="/" className="btn btn-primary">Back to home</Link>
        <Link href="/dashboard" className="btn btn-secondary">Go to dashboard <IconArrowRight size={15} /></Link>
      </div>
    </div>
  )
}
