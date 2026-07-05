'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconDownload, IconArrowRight } from '@/components/ui/icons'

export function BuyButton({
  agentId,
  slug,
  priceLabel,
  isFree,
  owned,
  signedIn,
  isOwnListing,
}: {
  agentId: string
  slug: string
  priceLabel: string
  isFree: boolean
  owned: boolean
  signedIn: boolean
  isOwnListing: boolean
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (isOwnListing) {
    return <span style={{ fontSize: 13, color: 'var(--foreground-tertiary)' }}>This is your listing.</span>
  }

  if (owned) {
    return (
      <a href={`/api/marketplace/agents/${agentId}/manifest`} className="btn btn-primary" style={{ width: '100%' }}>
        <IconDownload size={16} /> Download agent
      </a>
    )
  }

  const handleBuy = async () => {
    if (!signedIn) {
      router.push(`/auth/login?redirect=/marketplace/${slug}`)
      return
    }
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/marketplace/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Checkout failed')

      if (data.free) {
        router.refresh() // now owned → button flips to Download
        return
      }
      if (data.url) {
        window.location.href = data.url
        return
      }
      throw new Error('Unexpected response')
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
        <p role="alert" style={{ marginTop: 8, fontSize: 12.5, color: '#f87171' }}>{error}</p>
      )}
    </div>
  )
}
