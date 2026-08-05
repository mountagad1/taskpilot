import { describe, it, expect } from 'vitest'
import { Scratchpad, InMemoryStore, AgentMemory } from './index'

describe('Scratchpad.resolve', () => {
  const pad = new Scratchpad()
  pad.set('contacts', [{ email: 'a@x.test', name: 'Ada' }, { email: 'b@x.test' }])
  pad.set('summary', 'a short summary')
  pad.set('count', 3)

  it('resolves a top-level key', () => {
    expect(pad.resolve('summary')).toBe('a short summary')
  })

  it('resolves an array index and nested field', () => {
    expect(pad.resolve('contacts.0.email')).toBe('a@x.test')
    expect(pad.resolve('contacts.1.name')).toBeUndefined()
  })

  it('returns undefined for a missing path instead of throwing', () => {
    expect(pad.resolve('nope')).toBeUndefined()
    expect(pad.resolve('summary.deeper.still')).toBeUndefined()
    expect(pad.resolve('contacts.99.email')).toBeUndefined()
  })
})

describe('Scratchpad.interpolate', () => {
  const pad = new Scratchpad()
  pad.set('rows', [{ a: 1 }, { a: 2 }])
  pad.set('name', 'Ada')

  it('returns the raw value when the string is only a reference', () => {
    expect(pad.interpolate('{{rows}}')).toEqual([{ a: 1 }, { a: 2 }])
  })

  it('substitutes inside a larger string', () => {
    expect(pad.interpolate('Hello {{name}}!')).toBe('Hello Ada!')
  })

  it('JSON-encodes non-string values in a mixed string', () => {
    expect(pad.interpolate('data: {{rows}}')).toBe('data: [{"a":1},{"a":2}]')
  })

  it('leaves unknown references untouched rather than emitting "undefined"', () => {
    expect(pad.interpolate('Hi {{missing}}')).toBe('Hi {{missing}}')
    expect(pad.interpolate('{{missing}}')).toBe('{{missing}}')
  })

  it('walks nested objects and arrays', () => {
    expect(pad.interpolate({ to: '{{name}}', items: ['{{rows}}', 'literal'] })).toEqual({
      to: 'Ada',
      items: [[{ a: 1 }, { a: 2 }], 'literal'],
    })
  })

  it('passes non-string primitives through unchanged', () => {
    expect(pad.interpolate(42)).toBe(42)
    expect(pad.interpolate(true)).toBe(true)
    expect(pad.interpolate(null)).toBeNull()
  })
})

describe('Scratchpad.evaluate', () => {
  const pad = new Scratchpad()
  pad.set('emails', ['a@x.test'])
  pad.set('empty', [])
  pad.set('blank', '')
  pad.set('n', 5)
  pad.set('text', 'hello world')

  it('treats an empty array or empty string as not existing', () => {
    expect(pad.evaluate({ key: 'emails', op: 'exists' })).toBe(true)
    expect(pad.evaluate({ key: 'empty', op: 'exists' })).toBe(false)
    expect(pad.evaluate({ key: 'blank', op: 'exists' })).toBe(false)
    expect(pad.evaluate({ key: 'missing', op: 'not_exists' })).toBe(true)
  })

  it('compares equality and containment', () => {
    expect(pad.evaluate({ key: 'n', op: 'equals', value: 5 })).toBe(true)
    expect(pad.evaluate({ key: 'n', op: 'not_equals', value: 6 })).toBe(true)
    expect(pad.evaluate({ key: 'text', op: 'contains', value: 'world' })).toBe(true)
    expect(pad.evaluate({ key: 'emails', op: 'contains', value: 'a@x.test' })).toBe(true)
  })

  it('compares numbers only when both sides are numbers', () => {
    expect(pad.evaluate({ key: 'n', op: 'gt', value: 3 })).toBe(true)
    expect(pad.evaluate({ key: 'n', op: 'lt', value: 3 })).toBe(false)
    expect(pad.evaluate({ key: 'text', op: 'gt', value: 3 })).toBe(false)
  })
})

describe('InMemoryStore', () => {
  it('stores and retrieves values per namespace', async () => {
    const store = new InMemoryStore()
    await store.set('ns1', 'k', 'one')
    await store.set('ns2', 'k', 'two')

    expect(await store.get('ns1', 'k')).toBe('one')
    expect(await store.get('ns2', 'k')).toBe('two')
    expect(await store.get('ns3', 'k')).toBeNull()
  })

  it('expires entries past their TTL', async () => {
    const store = new InMemoryStore()
    await store.set('ns', 'k', 'v', -1) // already expired
    expect(await store.get('ns', 'k')).toBeNull()
  })

  it('lists only live keys in a namespace', async () => {
    const store = new InMemoryStore()
    await store.set('ns', 'live', 1)
    await store.set('ns', 'dead', 1, -1)
    await store.set('other', 'x', 1)

    expect(await store.list('ns')).toEqual(['live'])
  })
})

describe('AgentMemory', () => {
  it('scopes memory per user so two users never share state', async () => {
    const store = new InMemoryStore()
    const alice = new AgentMemory(store, { namespace: 'price-monitor', userId: 'alice' })
    const bob = new AgentMemory(store, { namespace: 'price-monitor', userId: 'bob' })

    await alice.remember('last_seen', 'alice-value')

    expect(await alice.recall('last_seen')).toBe('alice-value')
    expect(await bob.recall('last_seen')).toBeNull()
  })

  it('reads and writes nothing when disabled', async () => {
    const store = new InMemoryStore()
    const memory = new AgentMemory(store, { namespace: 'x', userId: 'u', enabled: false })

    await memory.remember('k', 'v')
    expect(await memory.recall('k')).toBeNull()
    expect(await memory.keys()).toEqual([])
  })
})
