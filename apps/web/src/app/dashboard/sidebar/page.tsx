'use client'

/**
 * AI Sidebar — dashboard product page.
 *
 * A working chat-style surface that runs AI tasks against pasted or
 * typed content via the existing POST /api/ai/process route
 * (summarize / extract / translate / rewrite / custom).
 *
 * Session history is kept in React state for the session; each run
 * shows its task type, result, token cost, copy, and retry.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { EmptyState, ErrorState, Skeleton } from '@/components/states'

type TaskType =
  | 'summarize'
  | 'extract_data'
  | 'translate'
  | 'rewrite'
  | 'custom'

const TASKS: { id: TaskType; label: string; icon: string; hint: string }[] = [
  { id: 'summarize', label: 'Summarize', icon: '≡', hint: 'Condense to key points' },
  { id: 'extract_data', label: 'Extract', icon: '⌗', hint: 'Pull structured data' },
  { id: 'translate', label: 'Translate', icon: '⇄', hint: 'Into another language' },
  { id: 'rewrite', label: 'Rewrite', icon: '✎', hint: 'Improve or restyle' },
  { id: 'custom', label: 'Ask', icon: '✦', hint: 'Your own instruction' },
]

const PROMPT_LIBRARY: { label: string; task: TaskType; prompt: string }[] = [
  { label: 'TL;DR in 3 bullets', task: 'summarize', prompt: 'Summarize this in exactly 3 bullet points.' },
  { label: 'Extract all emails', task: 'extract_data', prompt: 'Extract every email address as a list.' },
  { label: 'Make it more concise', task: 'rewrite', prompt: 'Rewrite this to be 30% shorter without losing meaning.' },
  { label: 'Translate to French', task: 'translate', prompt: 'Translate this into French.' },
  { label: 'Draft a polite reply', task: 'custom', prompt: 'Write a short, polite reply to this message.' },
]

interface Turn {
  id: string
  task: TaskType
  input: string
  instruction: string
  status: 'loading' | 'done' | 'error'
  output?: string
  tokensUsed?: number
  cached?: boolean
  error?: string
}

export default function SidebarPage() {
  const [task, setTask] = useState<TaskType>('summarize')
  const [input, setInput] = useState('')
  const [instruction, setInstruction] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns])

  const run = useCallback(
    async (opts?: { retryId?: string; forceTask?: TaskType; forceInstruction?: string }) => {
      const activeTask = opts?.forceTask ?? task
      const activeInstruction = opts?.forceInstruction ?? instruction
      if (!input.trim()) return

      const id = opts?.retryId ?? crypto.randomUUID()
      const turn: Turn = {
        id,
        task: activeTask,
        input,
        instruction: activeInstruction,
        status: 'loading',
      }

      setTurns((prev) =>
        opts?.retryId
          ? prev.map((t) => (t.id === opts.retryId ? turn : t))
          : [...prev, turn],
      )

      try {
        const res = await fetch('/api/ai/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task: activeTask,
            pageContext: {
              url: 'https://app.taskpilot.cc/dashboard/sidebar',
              title: 'AI Sidebar',
              content: input.slice(0, 8000),
            },
            userInput: activeTask === 'custom' ? activeInstruction || undefined : undefined,
            options:
              activeTask === 'translate' && activeInstruction
                ? { targetLanguage: activeInstruction }
                : undefined,
          }),
        })

        if (res.status === 429) throw new Error('Rate limit reached. Try again shortly.')
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `Request failed (${res.status})`)
        }

        const data = await res.json()
        const output =
          data.result ?? data.output ?? data.text ?? data.content ?? JSON.stringify(data, null, 2)

        setTurns((prev) =>
          prev.map((t) =>
            t.id === id
              ? {
                  ...t,
                  status: 'done',
                  output: typeof output === 'string' ? output : JSON.stringify(output, null, 2),
                  tokensUsed: data.tokensUsed ?? data.tokens_used,
                  cached: data.cached,
                }
              : t,
          ),
        )
      } catch (err) {
        setTurns((prev) =>
          prev.map((t) =>
            t.id === id
              ? { ...t, status: 'error', error: err instanceof Error ? err.message : 'Failed' }
              : t,
          ),
        )
      }
    },
    [task, instruction, input],
  )

  const needsInstruction = task === 'custom' || task === 'translate'

  return (
    <div className="p-8 max-w-6xl h-full">
      <div className="mb-6">
        <h1 className="text-2xl font-heading font-bold text-foreground">AI Sidebar</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--foreground-secondary)' }}>
          Run AI tasks on any content. In the extension this reads the live page;
          here you paste the content in.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        {/* Conversation column */}
        <div className="flex flex-col" style={{ minHeight: 520 }}>
          {/* History */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto space-y-4 pr-1"
            style={{ maxHeight: 460 }}
          >
            {turns.length === 0 && (
              <EmptyState
                icon="✦"
                title="Nothing run yet"
                description="Paste content below, choose a task, and TaskPilot will process it. Results stack here like a conversation."
              />
            )}

            {turns.map((t) => (
              <div key={t.id} className="space-y-2">
                {/* User bubble */}
                <div className="flex justify-end">
                  <div
                    className="rounded-xl rounded-br-sm px-4 py-2.5 max-w-[80%]"
                    style={{ background: 'var(--surface-active)' }}
                  >
                    <div
                      className="text-xs font-heading font-semibold mb-1"
                      style={{ color: 'var(--indigo-light)' }}
                    >
                      {TASKS.find((x) => x.id === t.task)?.label}
                      {t.instruction ? ` — ${t.instruction}` : ''}
                    </div>
                    <div
                      className="text-sm whitespace-pre-wrap break-words"
                      style={{ color: 'var(--foreground-secondary)' }}
                    >
                      {t.input.length > 220 ? t.input.slice(0, 220) + '…' : t.input}
                    </div>
                  </div>
                </div>

                {/* Assistant bubble */}
                <div className="flex justify-start">
                  <div
                    className="glass rounded-xl rounded-bl-sm px-4 py-3 max-w-[85%] w-full"
                  >
                    {t.status === 'loading' && (
                      <div className="space-y-2" aria-busy="true">
                        <Skeleton style={{ height: 12, width: '90%' }} />
                        <Skeleton style={{ height: 12, width: '75%' }} />
                        <Skeleton style={{ height: 12, width: '82%' }} />
                      </div>
                    )}

                    {t.status === 'error' && (
                      <div>
                        <p className="text-sm" style={{ color: '#f87171' }}>
                          {t.error}
                        </p>
                        <button
                          onClick={() =>
                            run({ retryId: t.id, forceTask: t.task, forceInstruction: t.instruction })
                          }
                          className="mt-2 text-xs px-3 py-1 rounded-md"
                          style={{ background: 'var(--surface-active)', color: 'var(--foreground)' }}
                        >
                          Retry
                        </button>
                      </div>
                    )}

                    {t.status === 'done' && (
                      <div>
                        <div
                          className="text-sm whitespace-pre-wrap break-words"
                          style={{ color: 'var(--foreground)' }}
                        >
                          {t.output}
                        </div>
                        <div
                          className="flex items-center gap-3 mt-3 pt-2 border-t"
                          style={{ borderColor: 'var(--border-subtle)' }}
                        >
                          <button
                            onClick={() => navigator.clipboard?.writeText(t.output || '')}
                            className="text-xs"
                            style={{ color: 'var(--foreground-tertiary)' }}
                          >
                            Copy
                          </button>
                          <button
                            onClick={() =>
                              run({ retryId: t.id, forceTask: t.task, forceInstruction: t.instruction })
                            }
                            className="text-xs"
                            style={{ color: 'var(--foreground-tertiary)' }}
                          >
                            Retry
                          </button>
                          {t.cached && (
                            <span className="text-xs" style={{ color: '#10b981' }}>
                              cached
                            </span>
                          )}
                          {typeof t.tokensUsed === 'number' && (
                            <span
                              className="text-xs font-mono ml-auto"
                              style={{ color: 'var(--foreground-tertiary)' }}
                            >
                              {t.tokensUsed} tok
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Composer */}
          <div className="glass rounded-xl p-4 mt-4">
            {/* Task chips */}
            <div className="flex flex-wrap gap-2 mb-3">
              {TASKS.map((tk) => (
                <button
                  key={tk.id}
                  onClick={() => setTask(tk.id)}
                  title={tk.hint}
                  className="px-3 py-1.5 rounded-lg text-xs font-heading font-semibold transition-all"
                  style={{
                    background: task === tk.id ? 'var(--gradient-brand)' : 'var(--surface)',
                    color: task === tk.id ? '#fff' : 'var(--foreground-secondary)',
                    border: task === tk.id ? 'none' : '1px solid var(--border)',
                  }}
                >
                  <span className="mr-1" aria-hidden>{tk.icon}</span>
                  {tk.label}
                </button>
              ))}
            </div>

            {needsInstruction && (
              <input
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder={
                  task === 'translate' ? 'Target language, e.g. French' : 'Your instruction…'
                }
                className="w-full rounded-lg px-3 py-2 text-sm mb-2 outline-none"
                style={{
                  background: 'var(--background)',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                }}
              />
            )}

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste the content to work on…"
              rows={3}
              className="w-full rounded-lg px-3 py-2 text-sm resize-none outline-none"
              style={{
                background: 'var(--background)',
                border: '1px solid var(--border)',
                color: 'var(--foreground)',
              }}
            />
            <div className="flex justify-between items-center mt-2">
              <span className="text-xs font-mono" style={{ color: 'var(--foreground-tertiary)' }}>
                {input.length}/8000
              </span>
              <button
                onClick={() => run()}
                disabled={!input.trim()}
                className="px-4 py-2 rounded-lg text-sm font-heading font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'var(--gradient-brand)', color: '#fff' }}
              >
                Run task
              </button>
            </div>
          </div>
        </div>

        {/* Prompt library */}
        <aside className="space-y-4">
          <div className="glass rounded-xl p-4">
            <p
              className="text-xs font-heading font-semibold mb-3"
              style={{ color: 'var(--foreground-tertiary)' }}
            >
              PROMPT LIBRARY
            </p>
            <div className="space-y-2">
              {PROMPT_LIBRARY.map((p) => (
                <button
                  key={p.label}
                  onClick={() => {
                    setTask(p.task)
                    setInstruction(p.prompt)
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs transition-all"
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--foreground-secondary)',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          {turns.length > 0 && (
            <button
              onClick={() => setTurns([])}
              className="w-full px-3 py-2 rounded-lg text-xs font-heading font-semibold transition-all"
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--foreground-tertiary)',
              }}
            >
              Clear session
            </button>
          )}
        </aside>
      </div>
    </div>
  )
}
