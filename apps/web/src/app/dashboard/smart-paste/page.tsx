'use client'

/**
 * Smart Paste — dashboard product page.
 *
 * Wired to the existing POST /api/ai/smart-paste route (3-layer
 * regex → heuristic → AI parser). Lets a signed-in user paste
 * unstructured contact text and see the parsed, mapped fields with
 * a confidence score and which parsing layers fired.
 *
 * Real backend. Real loading / empty / error states.
 */

import { useState, useCallback } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { EmptyState, ErrorState, Skeleton } from '@/components/states'

interface ParseResult {
  fields: Record<string, string>
  confidence: number
  usedAI?: boolean
  tokensUsed?: number
  layers?: string[]
  cached?: boolean
}

const FIELD_LABELS: Record<string, string> = {
  firstName: 'First name',
  lastName: 'Last name',
  email: 'Email',
  phone: 'Phone',
  jobTitle: 'Job title',
  company: 'Company',
  website: 'Website',
  address: 'Address',
  city: 'City',
  country: 'Country',
  linkedin: 'LinkedIn',
  twitter: 'Twitter',
}

const SAMPLES: { label: string; text: string }[] = [
  {
    label: 'LinkedIn profile',
    text: 'Sarah Chen\nVP of Engineering at Northwind Labs\nsarah.chen@northwind.io\n+1 (415) 555-0142\nlinkedin.com/in/sarahchen',
  },
  {
    label: 'Email signature',
    text: 'Best,\nMarcus Reed\nFounder, Reed & Co. LLC\nmarcus@reedco.com | reedco.com\nSan Francisco, CA',
  },
  {
    label: 'Business card',
    text: 'DR. PRIYA NAIR\nChief Medical Officer\nHelix Bio Inc.\npriya.nair@helixbio.com\n(617) 555-0198 · Boston, MA',
  },
]

function confidenceColor(c: number): string {
  if (c >= 0.8) return '#10b981'
  if (c >= 0.5) return '#f59e0b'
  return '#f87171'
}

export default function SmartPastePage() {
  const supabase = createClientComponentClient()
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ParseResult | null>(null)

  const parse = useCallback(async () => {
    if (!text.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const res = await fetch('/api/ai/smart-paste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clipboardText: text.slice(0, 5000),
          pageContext: {
            url: 'https://app.taskpilot.cc/dashboard/smart-paste',
            title: 'Smart Paste Playground',
            forms: [],
            pageType: 'form',
          },
          sessionToken: session?.access_token,
        }),
      })

      if (res.status === 429) {
        throw new Error('Rate limit reached. Wait a moment and try again.')
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Request failed (${res.status})`)
      }

      const data: ParseResult = await res.json()
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }, [text, supabase])

  const fieldEntries = result
    ? Object.entries(result.fields).filter(([, v]) => v)
    : []

  return (
    <div className="p-8 space-y-8 max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">
          Smart Paste
        </h1>
        <p
          className="text-sm mt-1"
          style={{ color: 'var(--foreground-secondary)' }}
        >
          Paste any unstructured contact text. TaskPilot parses it through
          regex, heuristics, and AI — only spending tokens when it needs to.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input */}
        <div className="space-y-4">
          <div className="glass rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <label
                className="text-xs font-heading font-semibold"
                style={{ color: 'var(--foreground-secondary)' }}
              >
                PASTE TEXT
              </label>
              <span
                className="text-xs font-mono"
                style={{ color: 'var(--foreground-tertiary)' }}
              >
                {text.length}/5000
              </span>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Sarah Chen&#10;VP Engineering at Northwind&#10;sarah@northwind.io"
              rows={8}
              maxLength={5000}
              className="w-full rounded-lg px-3 py-2.5 text-sm font-mono resize-none outline-none"
              style={{
                background: 'var(--background)',
                border: '1px solid var(--border)',
                color: 'var(--foreground)',
              }}
            />
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={parse}
                disabled={loading || !text.trim()}
                className="px-4 py-2 rounded-lg text-sm font-heading font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: 'var(--gradient-brand)',
                  color: '#fff',
                }}
              >
                {loading ? 'Parsing…' : 'Parse fields'}
              </button>
              <button
                onClick={() => {
                  setText('')
                  setResult(null)
                  setError(null)
                }}
                className="px-4 py-2 rounded-lg text-sm font-heading transition-all"
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground-secondary)',
                }}
              >
                Clear
              </button>
            </div>
          </div>

          {/* Samples */}
          <div className="glass rounded-xl p-5">
            <p
              className="text-xs font-heading font-semibold mb-3"
              style={{ color: 'var(--foreground-tertiary)' }}
            >
              TRY A SAMPLE
            </p>
            <div className="flex flex-wrap gap-2">
              {SAMPLES.map((s) => (
                <button
                  key={s.label}
                  onClick={() => {
                    setText(s.text)
                    setResult(null)
                    setError(null)
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--foreground-secondary)',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Output */}
        <div>
          {loading && (
            <div className="glass rounded-xl p-5 space-y-3" aria-busy="true">
              <Skeleton style={{ height: 14, width: '35%' }} />
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton style={{ height: 34, width: '30%' }} />
                  <Skeleton style={{ height: 34, flex: 1 }} />
                </div>
              ))}
            </div>
          )}

          {!loading && error && (
            <ErrorState message={error} onRetry={parse} />
          )}

          {!loading && !error && !result && (
            <EmptyState
              icon="⚡"
              title="No fields parsed yet"
              description="Paste contact text on the left, or pick a sample, then hit Parse fields to see the mapped output."
            />
          )}

          {!loading && !error && result && fieldEntries.length === 0 && (
            <EmptyState
              icon="○"
              title="Nothing recognizable found"
              description="The parser couldn't identify contact fields in that text. Try text that includes a name, email, or phone number."
            />
          )}

          {!loading && !error && result && fieldEntries.length > 0 && (
            <div className="glass rounded-xl overflow-hidden">
              {/* Meta bar */}
              <div
                className="px-5 py-3 flex items-center justify-between border-b flex-wrap gap-2"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs font-heading font-semibold"
                    style={{ color: confidenceColor(result.confidence) }}
                  >
                    {(result.confidence * 100).toFixed(0)}% confidence
                  </span>
                  {result.cached && (
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        background: 'rgba(16,185,129,0.12)',
                        color: '#10b981',
                      }}
                    >
                      cached
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {(result.layers || []).map((l) => (
                    <span
                      key={l}
                      className="text-xs px-2 py-0.5 rounded-full font-mono"
                      style={{
                        background: 'var(--surface-hover)',
                        color: 'var(--foreground-tertiary)',
                      }}
                    >
                      {l}
                    </span>
                  ))}
                </div>
              </div>

              {/* Fields */}
              <div>
                {fieldEntries.map(([key, value], i) => (
                  <div
                    key={key}
                    className="px-5 py-3 flex items-center gap-4"
                    style={{
                      borderBottom:
                        i < fieldEntries.length - 1
                          ? '1px solid var(--border-subtle)'
                          : 'none',
                    }}
                  >
                    <span
                      className="text-xs font-heading font-semibold w-28 shrink-0"
                      style={{ color: 'var(--foreground-tertiary)' }}
                    >
                      {FIELD_LABELS[key] || key}
                    </span>
                    <span
                      className="text-sm font-mono flex-1 break-all"
                      style={{ color: 'var(--foreground)' }}
                    >
                      {value}
                    </span>
                    <button
                      onClick={() => navigator.clipboard?.writeText(value)}
                      className="text-xs px-2 py-1 rounded-md transition-all shrink-0"
                      style={{
                        background: 'var(--surface)',
                        color: 'var(--foreground-tertiary)',
                      }}
                      aria-label={`Copy ${FIELD_LABELS[key] || key}`}
                    >
                      Copy
                    </button>
                  </div>
                ))}
              </div>

              {typeof result.tokensUsed === 'number' && (
                <div
                  className="px-5 py-2.5 text-xs font-mono border-t"
                  style={{
                    borderColor: 'var(--border)',
                    color: 'var(--foreground-tertiary)',
                  }}
                >
                  {result.tokensUsed > 0
                    ? `${result.tokensUsed} tokens · ${result.usedAI ? 'AI layer used' : 'no AI needed'}`
                    : 'Resolved without AI — 0 tokens spent'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
