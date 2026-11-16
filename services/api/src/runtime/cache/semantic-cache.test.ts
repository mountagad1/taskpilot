import { describe, it, expect } from 'vitest'

import { MemoryBackend, SemanticCache } from './semantic-cache'

const base = {
  scope: 'user-a',
  task: 'summarize',
  model: 'gpt-4.1-mini',
  pageContent: 'Inbox: invoice from ACME, salary review, medical results',
  url: 'https://mail.example.com/inbox',
}

describe('SemanticCache.generateKey', () => {
  const cache = new SemanticCache(new MemoryBackend())

  it('is deterministic for the same caller and request', () => {
    expect(cache.generateKey(base)).toBe(cache.generateKey({ ...base }))
  })

  it('never shares a key between users on the same page', () => {
    expect(cache.generateKey(base)).not.toBe(cache.generateKey({ ...base, scope: 'user-b' }))
  })

  it('requires a scope', () => {
    expect(() => cache.generateKey({ ...base, scope: '' })).toThrow(/scope/)
  })

  it('distinguishes pages that only differ after the first 2000 characters', () => {
    const prefix = 'x'.repeat(5000)
    expect(cache.generateKey({ ...base, pageContent: `${prefix} alice` })).not.toBe(
      cache.generateKey({ ...base, pageContent: `${prefix} bob` })
    )
  })

  it('includes every prompt option', () => {
    const german = cache.generateKey({ ...base, task: 'translate', options: { target_language: 'de' } })
    const french = cache.generateKey({ ...base, task: 'translate', options: { target_language: 'fr' } })
    expect(german).not.toBe(french)
    expect(cache.generateKey({ ...base, options: { tone: 'formal' } })).not.toBe(
      cache.generateKey({ ...base, options: { tone: 'casual' } })
    )
  })

  it('is not fooled by delimiter tricks', () => {
    // With "a:b" string joining these two would have produced the same input.
    expect(cache.generateKey({ ...base, userInput: 'x:y', url: 'z' })).not.toBe(
      cache.generateKey({ ...base, userInput: 'x', url: 'y:z' })
    )
  })

  it('uses a full SHA-256 digest', () => {
    expect(cache.generateKey(base)).toMatch(/^semantic:summarize:[0-9a-f]{64}$/)
  })

  it('serves a hit only to the user who stored it', async () => {
    const keyA = cache.generateKey(base)
    await cache.set(keyA, 'summary of A’s inbox', { task: 'summarize', model: 'm', tokensUsed: 10 })
    expect(await cache.get(keyA)).toBe('summary of A’s inbox')
    expect(await cache.get(cache.generateKey({ ...base, scope: 'user-b' }))).toBeNull()
  })
})
