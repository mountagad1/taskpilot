'use client'

// ============================================================
// TASKPILOT — NOTIFICATION BELL
// apps/web/src/components/dashboard/notifications.tsx
//
// Polls the inbox for the unread count and renders the dropdown. Polling
// rather than a realtime subscription keeps the dashboard working without a
// websocket, and the interval is slow enough not to matter.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'

import { api, apiList } from '@/lib/client/api'

interface NotificationRow {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  read_at: string | null
  created_at: string
}

const POLL_INTERVAL_MS = 60_000

export default function NotificationBell() {
  const [items, setItems] = useState<NotificationRow[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await apiList<NotificationRow>('/v1/notifications?per_page=12')
      setItems(result.items)
      setUnread(result.meta.unread ?? 0)
    } catch {
      // A failed poll is not worth surfacing; the next tick retries.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [load])

  // Close on an outside click, so the dropdown behaves like every other menu.
  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const markAllRead = async () => {
    // Optimistic: the badge should clear the moment it is clicked.
    setUnread(0)
    setItems((current) => current.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })))
    try {
      await api.post('/v1/notifications/read')
    } catch {
      void load()
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        onClick={() => {
          setOpen(!open)
          if (!open) void load()
        }}
        aria-label={unread ? `${unread} unread notifications` : 'Notifications'}
        style={{
          position: 'relative',
          width: 32,
          height: 32,
          borderRadius: 8,
          border: '1px solid var(--border-subtle)',
          background: 'var(--surface)',
          color: 'var(--foreground-secondary)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <BellIcon />
        {unread > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              minWidth: 17,
              height: 17,
              padding: '0 4px',
              borderRadius: 9,
              background: '#ef4444',
              color: '#fff',
              fontSize: 10,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 40,
            width: 340,
            maxHeight: 420,
            overflowY: 'auto',
            background: 'var(--background-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: '0 18px 50px rgba(0,0,0,0.4)',
            zIndex: 60,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '11px 14px',
              borderBottom: '1px solid var(--border-subtle)',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600 }}>Notifications</span>
            {unread > 0 && (
              <button
                onClick={() => void markAllRead()}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--indigo-light)',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {loading && items.length === 0 ? (
            <div style={{ padding: 20, fontSize: 13, color: 'var(--foreground-muted)' }}>Loading…</div>
          ) : items.length === 0 ? (
            <div style={{ padding: 24, fontSize: 13, color: 'var(--foreground-muted)', textAlign: 'center' }}>
              Nothing yet. Run history and agent activity will show up here.
            </div>
          ) : (
            items.map((notification) => (
              <NotificationItem key={notification.id} notification={notification} onNavigate={() => setOpen(false)} />
            ))
          )}
        </div>
      )}
    </div>
  )
}

function NotificationItem({
  notification,
  onNavigate,
}: {
  notification: NotificationRow
  onNavigate: () => void
}) {
  const body = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        {!notification.read_at && (
          <span
            style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--indigo-light)', flex: 'none' }}
          />
        )}
        <span style={{ fontSize: 13, fontWeight: notification.read_at ? 400 : 500 }}>
          {notification.title}
        </span>
      </div>

      {notification.body && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--foreground-secondary)',
            marginTop: 3,
            marginLeft: notification.read_at ? 0 : 13,
          }}
        >
          {notification.body}
        </div>
      )}

      <div
        style={{
          fontSize: 11,
          color: 'var(--foreground-muted)',
          marginTop: 4,
          marginLeft: notification.read_at ? 0 : 13,
        }}
      >
        {formatRelative(notification.created_at)}
      </div>
    </>
  )

  const style: React.CSSProperties = {
    display: 'block',
    padding: '11px 14px',
    borderBottom: '1px solid var(--border-subtle)',
    textDecoration: 'none',
    color: 'inherit',
    background: notification.read_at ? 'transparent' : 'rgba(99,102,241,0.05)',
  }

  return notification.link ? (
    <Link href={notification.link} style={style} onClick={onNavigate}>
      {body}
    </Link>
  ) : (
    <div style={style}>{body}</div>
  )
}

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function formatRelative(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime()
  if (delta < 60_000) return 'just now'
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`
  if (delta < 604_800_000) return `${Math.floor(delta / 86_400_000)}d ago`
  return new Date(iso).toLocaleDateString()
}
