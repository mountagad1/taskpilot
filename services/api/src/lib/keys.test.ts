import { describe, it, expect } from 'vitest'
import { API_KEY_PREFIX } from '@taskpilot/shared'
import { createApiKey, extractApiKey, hashApiKey, normaliseScopes } from './keys'

describe('createApiKey', () => {
  it('produces a prefixed key with a matching digest', async () => {
    const generated = await createApiKey()

    expect(generated.key.startsWith(API_KEY_PREFIX)).toBe(true)
    expect(generated.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(await hashApiKey(generated.key)).toBe(generated.hash)
  })

  it('never repeats a key', async () => {
    const keys = await Promise.all(Array.from({ length: 25 }, () => createApiKey()))
    expect(new Set(keys.map((k) => k.key)).size).toBe(25)
  })

  it('exposes a prefix short enough to display but long enough to identify', async () => {
    const { prefix, key } = await createApiKey()
    expect(prefix).toHaveLength(8)
    expect(key).toContain(prefix)
  })

  it('produces a digest that reveals nothing about the key', async () => {
    const { key, hash } = await createApiKey()
    expect(hash).not.toContain(key.slice(API_KEY_PREFIX.length, API_KEY_PREFIX.length + 8))
  })
})

describe('extractApiKey', () => {
  it('reads a bearer token', () => {
    const key = `${API_KEY_PREFIX}abcdef123456`
    const headers = new Headers({ authorization: `Bearer ${key}` })
    expect(extractApiKey(headers)).toBe(key)
  })

  it('reads the X-API-Key header', () => {
    const key = `${API_KEY_PREFIX}abcdef123456`
    expect(extractApiKey(new Headers({ 'x-api-key': key }))).toBe(key)
  })

  it('is case-insensitive about the bearer scheme', () => {
    const key = `${API_KEY_PREFIX}abcdef123456`
    expect(extractApiKey(new Headers({ authorization: `bearer ${key}` }))).toBe(key)
  })

  it('ignores a bearer token that is not a TaskPilot key', () => {
    // A Supabase JWT arrives in the same header; it must not be mistaken
    // for an API key, or the wrong auth path would be taken.
    expect(extractApiKey(new Headers({ authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.x.y' }))).toBeNull()
  })

  it('returns null when no credential is present', () => {
    expect(extractApiKey(new Headers())).toBeNull()
  })
})

describe('normaliseScopes', () => {
  it('keeps recognised scopes and drops the rest', () => {
    expect(normaliseScopes(['agents:read', 'nonsense', 'runs:write', 42])).toEqual([
      'agents:read',
      'runs:write',
    ])
  })

  it('dedupes repeats', () => {
    expect(normaliseScopes(['agents:read', 'agents:read'])).toEqual(['agents:read'])
  })

  it('returns an empty list for a non-array', () => {
    expect(normaliseScopes('agents:read')).toEqual([])
    expect(normaliseScopes(null)).toEqual([])
  })
})
