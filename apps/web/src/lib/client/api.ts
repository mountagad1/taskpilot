'use client'

// ============================================================
// TASKPILOT WEB — API HOOKS
// apps/web/src/lib/client/api.ts
//
// Every dashboard request goes to the API service, not to this app. The
// caller's Supabase access token is attached as a Bearer credential —
// cookies do not cross an origin boundary, and that boundary is the point
// of the split.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'

import { API_URL as apiUrl, getAccessToken } from './auth'

export interface ApiFailure {
  code: string
  message: string
  issues?: Array<{ path: string; message: string }>
}

export class ApiRequestError extends Error {
  constructor(readonly status: number, readonly failure: ApiFailure) {
    super(failure.message)
    this.name = 'ApiRequestError'
  }

  /** Field name → message, for inline form errors. */
  get fieldErrors(): Record<string, string> {
    return Object.fromEntries((this.failure.issues ?? []).map((i) => [i.path, i.message]))
  }
}

export interface ListMeta {
  total: number
  page?: number
  per_page?: number
  unread?: number
}

/** Base URL of the API service. Same-origin `/v1` is the dev-proxy fallback. */
export { API_URL } from './auth'

function endpoint(path: string): string {
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${apiUrl}${suffix}`
}

async function authorisedInit(init: RequestInit): Promise<RequestInit> {
  const token = await getAccessToken()

  return {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  }
}

async function unwrap(response: Response): Promise<unknown> {
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const failure = (payload as { error?: ApiFailure } | null)?.error ?? {
      code: `http_${response.status}`,
      message: `Request failed (${response.status})`,
    }
    throw new ApiRequestError(response.status, failure)
  }

  return payload
}

/** Unwraps the shared `{ data }` envelope and throws on failure. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(endpoint(path), await authorisedInit(init))
  const payload = (await unwrap(response)) as { data?: T } | null
  return (payload?.data ?? payload) as T
}

export async function apiList<T>(path: string): Promise<{ items: T[]; meta: ListMeta }> {
  const response = await fetch(endpoint(path), await authorisedInit({}))
  const payload = (await unwrap(response)) as { data?: T[]; meta?: ListMeta } | null
  return { items: payload?.data ?? [], meta: payload?.meta ?? { total: 0 } }
}

// ─── HOOKS ───────────────────────────────────────────────────

export interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => void
}

/**
 * Fetches on mount and whenever `deps` change. A response that arrives after
 * a newer request started is discarded, so a slow first request cannot
 * overwrite a fast second one.
 */
export function useApi<T>(path: string | null, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(Boolean(path))
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const requestId = useRef(0)

  useEffect(() => {
    if (!path) {
      setLoading(false)
      return
    }

    const id = ++requestId.current
    setLoading(true)
    setError(null)

    apiFetch<T>(path)
      .then((result) => {
        if (id !== requestId.current) return
        setData(result)
      })
      .catch((err: unknown) => {
        if (id !== requestId.current) return
        setError(err instanceof Error ? err.message : 'Something went wrong')
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false)
      })

    return () => {
      // Invalidate the in-flight request so its result is discarded.
      requestId.current++
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, nonce, ...deps])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return { data, loading, error, reload }
}

export function useApiList<T>(path: string | null, deps: unknown[] = []) {
  const [items, setItems] = useState<T[]>([])
  const [meta, setMeta] = useState<ListMeta>({ total: 0 })
  const [loading, setLoading] = useState(Boolean(path))
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const requestId = useRef(0)

  useEffect(() => {
    if (!path) {
      setLoading(false)
      return
    }

    const id = ++requestId.current
    setLoading(true)
    setError(null)

    apiList<T>(path)
      .then((result) => {
        if (id !== requestId.current) return
        setItems(result.items)
        setMeta(result.meta)
      })
      .catch((err: unknown) => {
        if (id !== requestId.current) return
        setError(err instanceof Error ? err.message : 'Something went wrong')
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false)
      })

    return () => {
      requestId.current++
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, nonce, ...deps])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return { items, meta, loading, error, reload, setItems }
}

/**
 * Wraps a mutating call with pending/error state, keeping field-level
 * validation errors separate from the general message.
 */
export function useMutation<TInput, TOutput>(
  mutate: (input: TInput) => Promise<TOutput>
): {
  run: (input: TInput) => Promise<TOutput | null>
  pending: boolean
  error: string | null
  fieldErrors: Record<string, string>
  reset: () => void
} {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const run = useCallback(
    async (input: TInput): Promise<TOutput | null> => {
      setPending(true)
      setError(null)
      setFieldErrors({})

      try {
        return await mutate(input)
      } catch (err) {
        if (err instanceof ApiRequestError) {
          setError(err.message)
          setFieldErrors(err.fieldErrors)
        } else {
          setError(err instanceof Error ? err.message : 'Something went wrong')
        }
        return null
      } finally {
        setPending(false)
      }
    },
    [mutate]
  )

  const reset = useCallback(() => {
    setError(null)
    setFieldErrors({})
  }, [])

  return { run, pending, error, fieldErrors, reset }
}

// ─── SHORTCUTS ───────────────────────────────────────────────

export const api = {
  get: <T,>(path: string) => apiFetch<T>(path),
  post: <T,>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: <T,>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T,>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
}
