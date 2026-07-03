'use client'

/**
 * Shared UI state components — loading, empty, error.
 * Used across every dashboard product page so states are consistent
 * and never re-implemented per-page. Matches the app's CSS-variable
 * design tokens (--surface, --foreground, --gradient-brand, .glass).
 */

import type { ReactNode } from 'react'

// ─── Loading Skeleton ─────────────────────────────────────────

export function Skeleton({
  className = '',
  style,
}: {
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      className={`tp-skeleton rounded-md ${className}`}
      style={{
        background:
          'linear-gradient(90deg, var(--surface) 25%, var(--surface-hover) 37%, var(--surface) 63%)',
        backgroundSize: '400% 100%',
        animation: 'tp-shimmer 1.4s ease infinite',
        ...style,
      }}
    />
  )
}

/** A card-shaped loading block, e.g. while a list loads. */
export function SkeletonCard() {
  return (
    <div className="glass rounded-xl p-5 space-y-3">
      <Skeleton style={{ height: 14, width: '40%' }} />
      <Skeleton style={{ height: 28, width: '70%' }} />
      <Skeleton style={{ height: 12, width: '90%' }} />
    </div>
  )
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="glass rounded-xl p-4 flex items-center gap-4"
        >
          <Skeleton style={{ height: 36, width: 36, borderRadius: 9 }} />
          <div className="flex-1 space-y-2">
            <Skeleton style={{ height: 13, width: '30%' }} />
            <Skeleton style={{ height: 11, width: '55%' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Empty State ──────────────────────────────────────────────

export function EmptyState({
  icon = '◇',
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div
      className="glass rounded-xl flex flex-col items-center justify-center text-center px-6 py-16"
      role="status"
    >
      <div
        className="flex items-center justify-center mb-4"
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          fontSize: 22,
          background: 'var(--surface-hover)',
          color: 'var(--foreground-secondary)',
        }}
      >
        {icon}
      </div>
      <h3
        className="font-heading font-semibold text-sm"
        style={{ color: 'var(--foreground)' }}
      >
        {title}
      </h3>
      <p
        className="text-sm mt-1 max-w-sm"
        style={{ color: 'var(--foreground-tertiary)' }}
      >
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

// ─── Error State ──────────────────────────────────────────────

export function ErrorState({
  title = "That didn't work",
  message,
  onRetry,
}: {
  title?: string
  message: string
  onRetry?: () => void
}) {
  return (
    <div
      className="glass rounded-xl flex flex-col items-center justify-center text-center px-6 py-14"
      role="alert"
    >
      <div
        className="flex items-center justify-center mb-4"
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          fontSize: 22,
          background: 'rgba(239,68,68,0.12)',
          color: '#f87171',
        }}
      >
        !
      </div>
      <h3
        className="font-heading font-semibold text-sm"
        style={{ color: 'var(--foreground)' }}
      >
        {title}
      </h3>
      <p
        className="text-sm mt-1 max-w-sm"
        style={{ color: 'var(--foreground-tertiary)' }}
      >
        {message}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-5 px-4 py-2 rounded-lg text-xs font-heading font-semibold transition-all"
          style={{
            background: 'var(--surface-active)',
            color: 'var(--foreground)',
            border: '1px solid var(--border)',
          }}
        >
          Try again
        </button>
      )}
    </div>
  )
}

// ─── Demo Data Banner ─────────────────────────────────────────
// Used on pages that show illustrative data not yet wired to a live
// source. Honest labelling instead of fake trust signals.

export function DemoBanner({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-lg px-4 py-2.5 text-xs flex items-center gap-2"
      style={{
        background: 'rgba(245,158,11,0.10)',
        border: '1px solid rgba(245,158,11,0.25)',
        color: '#fbbf24',
      }}
    >
      <span aria-hidden>◔</span>
      <span>{children}</span>
    </div>
  )
}
