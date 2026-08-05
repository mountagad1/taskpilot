'use client'

// ============================================================
// TASKPILOT WEB — MARKETPLACE BUY BUTTON
// apps/web/src/components/marketplace/buy-button.tsx
//
// The agent page is public and server-rendered identically for everyone, so
// entitlement is resolved here in the browser. Until that resolves the
// button shows the price — the safe default, since offering a download to
// someone who has not bought would be the worse mistake.
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { IconDownload, IconArrowRight } from '@/components/ui/icons'
import { api, apiFetch, API_URL } from '@/lib/client/api'
import { getAccessToken, isSignedIn } from '@/lib/client/auth'

interface Entitlement {
  owned: boolean
  viewer_id: string | null
  owner_id: string | null
}

export function BuyButton({
  agentId,
  slug,
  priceLabel,
  isFree,
}: {
  agentId: string
  slug: string
  priceLabel: string
  isFree: boolean
}) {
  const router = useRouter()
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!isSignedIn()) {
      setEntitlement({ owned: false, viewer_id: null, owner_id: null })
      return
    }
    try {
      const agent = await apiFetch<Entitlement>(`/v1/marketplace/agents/${slug}`)
      setEntitlement(agent)
    } catch {
      // A failed lookup reads as "not owned", which shows the buy button.
      setEntitlement({ owned: false, viewer_id: null, owner_id: null })
    }
  }, [slug])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const signedIn = Boolean(entitlement?.viewer_id)
  const isOwnListing = Boolean(
    entitlement?.viewer_id && entitlement.viewer_id === entitlement.owner_id
  )

  if (isOwnListing) {
    return (
      <span style={{ fontSize: 13, color: 'var(--foreground-tertiary)' }}>This is your listing.</span>
    )
  }

  if (entitlement?.owned) {
    return <DownloadManifestButton agentId={agentId} slug={slug} />
  }

  const handleBuy = async () => {
    if (!signedIn) {
      router.push(`/auth/login?redirect=/marketplace/${slug}`)
      return
    }

    setError(null)
    setLoading(true)

    try {
      const result = await api.post<{ free?: true; url?: string }>('/v1/billing/checkout', {
        agentId,
      })

      if (result.free) {
        // Now entitled — flip the button rather than reloading the page.
        await refresh()
        setLoading(false)
        return
      }

      if (result.url) {
        window.location.href = result.url
        return
      }

      throw new Error('Unexpected response from checkout')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <div style={{ width: '100%' }}>
      <button onClick={handleBuy} disabled={loading} className="btn btn-primary" style={{ width: '100%' }}>
        {loading ? 'Starting…' : isFree ? 'Get agent — free' : `Buy for ${priceLabel}`}
        {!loading && <IconArrowRight size={15} />}
      </button>
      {error && (
        <p role="alert" style={{ marginTop: 8, fontSize: 12.5, color: '#f87171' }}>
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * The manifest endpoint requires a Bearer token, so a plain `<a href>` would
 * 401. Fetch it with credentials and hand the browser a blob instead.
 */
export function DownloadManifestButton({ agentId, slug }: { agentId: string; slug: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const download = async () => {
    setBusy(true)
    setError(null)

    try {
      const token = await getAccessToken()
      const response = await fetch(`${API_URL}/v1/agents/${agentId}/manifest`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error?.message ?? 'Could not download the manifest')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.href = url
      link.download = `${slug}.agent.json`
      document.body.appendChild(link)
      link.click()
      link.remove()

      // Release the object URL once the download has been handed off.
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ width: '100%' }}>
      <button onClick={download} disabled={busy} className="btn btn-primary" style={{ width: '100%' }}>
        <IconDownload size={16} /> {busy ? 'Preparing…' : 'Download agent'}
      </button>
      {error && (
        <p role="alert" style={{ marginTop: 8, fontSize: 12.5, color: '#f87171' }}>
          {error}
        </p>
      )}
    </div>
  )
}
