// ============================================================
// TASKPILOT WEB — DASHBOARD LAYOUT
// apps/web/src/app/dashboard/layout.tsx
//
// `RequireAuth` and `DashboardShell` both existed but nothing composed
// them, so every dashboard route rendered bare: no sign-in gate, no
// navigation, and no auth context. A signed-out visitor got the page with
// "Authentication required" errors on it instead of being sent to log in,
// and the extension handover in RequireAuth never fired at all.
//
// Order matters. RequireAuth resolves the session and supplies the
// AuthProvider that DashboardShell reads with `useAuth()`, so the shell has
// to sit inside it — outside, the hook throws for want of a provider.
// ============================================================

import RequireAuth from '@/components/dashboard/require-auth'
import DashboardShell from '@/components/dashboard/shell'

// The dashboard is per-user and reads a client-held token, so there is
// nothing here worth prerendering.
export const dynamic = 'force-dynamic'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <DashboardShell>{children}</DashboardShell>
    </RequireAuth>
  )
}
