'use client'

// ============================================================
// TASKPILOT WEB — DASHBOARD AUTH CONTEXT
// apps/web/src/components/dashboard/auth-context.tsx
//
// Its own module because two separate client components use it — the
// boundary that provides it and the shell that consumes it. Sharing a
// context defined inside one of them relies on both landing in the same
// client bundle, which is not something to depend on.
//
// `AuthProvider` is a real component rather than a re-exported
// `Context.Provider`. Next wraps every export crossing a client boundary in
// a client-reference proxy, and a raw Provider object is not a function —
// it arrives as `undefined` and React fails with "element type is invalid".
// ============================================================

import { createContext, useContext, type ReactNode } from 'react'
import type { PlanType } from '@taskpilot/shared'

export interface AuthValue {
  email: string
  plan: PlanType
}

const AuthContext = createContext<AuthValue>({ email: '', plan: 'free' })

export function AuthProvider({ value, children }: { value: AuthValue; children: ReactNode }) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** Identity for any component rendered inside the dashboard shell. */
export function useAuth(): AuthValue {
  return useContext(AuthContext)
}
