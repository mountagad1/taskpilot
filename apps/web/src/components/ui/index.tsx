// ============================================================
// TASKPILOT — DESIGN SYSTEM PRIMITIVES
// Reusable, SSR-safe building blocks. Presentational only
// (no hooks) so they render in server or client trees.
// ============================================================

import type { ReactNode, CSSProperties, ButtonHTMLAttributes } from 'react'

function cx(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/* ── Container ── */
export function Container({
  children,
  className,
  style,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <div className={cx('ui-container', className)} style={style}>
      {children}
    </div>
  )
}

/* ── Section ── */
export function Section({
  children,
  id,
  className,
  tight,
  style,
}: {
  children: ReactNode
  id?: string
  className?: string
  tight?: boolean
  style?: CSSProperties
}) {
  return (
    <section id={id} className={cx(tight ? 'ui-section-tight' : 'ui-section', className)} style={style}>
      {children}
    </section>
  )
}

/* ── Button (renders <a> when href is set) ── */
type ButtonVariant = 'primary' | 'secondary' | 'ghost'
type ButtonSize = 'sm' | 'md' | 'lg'

const btnClass = (variant: ButtonVariant, size: ButtonSize, className?: string) =>
  cx('btn', `btn-${variant}`, size !== 'md' && `btn-${size}`, className)

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  href,
  className,
  ...rest
}: {
  children: ReactNode
  variant?: ButtonVariant
  size?: ButtonSize
  href?: string
  className?: string
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  if (href) {
    return (
      <a href={href} className={btnClass(variant, size, className)}>
        {children}
      </a>
    )
  }
  return (
    <button className={btnClass(variant, size, className)} {...rest}>
      {children}
    </button>
  )
}

/* ── Card ── */
export function Card({
  children,
  className,
  hover,
  style,
}: {
  children: ReactNode
  className?: string
  hover?: boolean
  style?: CSSProperties
}) {
  return (
    <div className={cx('ui-card', hover && 'ui-card-hover', className)} style={style}>
      {children}
    </div>
  )
}

/* ── Badge ── */
export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: 'indigo' | 'cyan' | 'success' | 'neutral'
  className?: string
}) {
  return <span className={cx('badge', `badge-${tone}`, className)}>{children}</span>
}

/* ── Eyebrow (small pill label above headings) ── */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="eyebrow">{children}</span>
}

/* ── Gradient heading ── */
export function GradientHeading({
  children,
  as: Tag = 'h2',
  className,
  style,
}: {
  children: ReactNode
  as?: 'h1' | 'h2' | 'h3'
  className?: string
  style?: CSSProperties
}) {
  return (
    <Tag className={cx('gradient-text', className)} style={style}>
      {children}
    </Tag>
  )
}

/* ── Section heading block (eyebrow + title + sub) ── */
export function SectionHeading({
  eyebrow,
  title,
  sub,
  center = true,
}: {
  eyebrow?: string
  title: ReactNode
  sub?: ReactNode
  center?: boolean
}) {
  return (
    <div style={{ textAlign: center ? 'center' : 'left', maxWidth: center ? 640 : undefined, margin: center ? '0 auto' : undefined }}>
      {eyebrow && <div style={{ marginBottom: 16 }}><Eyebrow>{eyebrow}</Eyebrow></div>}
      <h2 style={{ fontSize: 'clamp(26px, 3.4vw, 38px)', fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.15 }}>
        {title}
      </h2>
      {sub && (
        <p style={{ marginTop: 14, fontSize: 16, lineHeight: 1.6, color: 'var(--foreground-secondary)', maxWidth: 560, marginInline: center ? 'auto' : undefined }}>
          {sub}
        </p>
      )}
    </div>
  )
}

/* ── Feature card (icon + title + description) ── */
export function FeatureCard({
  icon,
  title,
  children,
  accent = 'var(--indigo-light)',
}: {
  icon: ReactNode
  title: string
  children: ReactNode
  accent?: string
}) {
  return (
    <Card hover className="feature-card">
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--surface-active)',
          color: accent,
          marginBottom: 14,
        }}
      >
        {icon}
      </div>
      <h3 style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 6 }}>{title}</h3>
      <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--foreground-secondary)' }}>{children}</p>
    </Card>
  )
}
