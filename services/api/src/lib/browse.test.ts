import { describe, it, expect, vi } from 'vitest'
import type { Context } from 'hono'
import type { SupabaseClient } from '@supabase/supabase-js'

import { browseAgents } from './browse'

/**
 * Records the Postgrest calls the query builder receives so we can assert
 * the filters that were applied, without needing a database.
 */
function fakeDb() {
  const calls: Array<{ method: string; args: unknown[] }> = []

  const builder: Record<string, unknown> = {}
  const chain = (method: string) =>
    vi.fn((...args: unknown[]) => {
      calls.push({ method, args })
      return builder
    })

  for (const method of ['select', 'eq', 'or', 'lte', 'order', 'range']) {
    builder[method] = chain(method)
  }

  // The builder is awaited at the end of the chain.
  builder.then = (resolve: (value: unknown) => unknown) =>
    resolve({ data: [{ id: 'a1' }], error: null, count: 1 })

  const db = { from: vi.fn(() => builder) } as unknown as SupabaseClient

  return { db, calls }
}

/** Minimal Hono context: browseAgents only reads the request URL. */
function request(query = ''): Context {
  const url = `https://taskpilot.cc/v1/marketplace/agents${query}`
  return { req: { url } } as unknown as Context
}

function findCall(calls: Array<{ method: string; args: unknown[] }>, method: string, first?: unknown) {
  return calls.find((c) => c.method === method && (first === undefined || c.args[0] === first))
}

describe('browseAgents', () => {
  it('only ever returns listed, public agents', async () => {
    const { db, calls } = fakeDb()
    await browseAgents(db, request())

    expect(findCall(calls, 'eq', 'status')?.args[1]).toBe('listed')
    expect(findCall(calls, 'eq', 'visibility')?.args[1]).toBe('public')
  })

  it('defaults to sorting by installs', async () => {
    const { db, calls } = fakeDb()
    await browseAgents(db, request())

    expect(findCall(calls, 'order', 'install_count')).toBeTruthy()
  })

  it.each([
    ['newest', 'created_at'],
    ['rating', 'rating_avg'],
    ['price', 'price_cents'],
  ])('sorts by %s', async (sort, column) => {
    const { db, calls } = fakeDb()
    await browseAgents(db, request(`?sort=${sort}`))
    expect(findCall(calls, 'order', column)).toBeTruthy()
  })

  it('applies a category filter only when it is a known category', async () => {
    const valid = fakeDb()
    await browseAgents(valid.db, request('?category=sales'))
    expect(findCall(valid.calls, 'eq', 'category')?.args[1]).toBe('sales')

    const invalid = fakeDb()
    await browseAgents(invalid.db, request('?category=not-a-category'))
    expect(findCall(invalid.calls, 'eq', 'category')).toBeUndefined()
  })

  it('strips PostgREST delimiters from a search term', async () => {
    const { db, calls } = fakeDb()
    // Commas and parentheses would otherwise change how the `or` filter parses.
    await browseAgents(db, request('?q=' + encodeURIComponent('lead,capture(x)')))

    const filter = findCall(calls, 'or')?.args[0] as string
    expect(filter).toBeTruthy()
    expect(filter).not.toContain('lead,capture')
    expect(filter).not.toContain('(x)')
    expect(filter).toContain('lead capture')
  })

  it('applies price filters', async () => {
    const capped = fakeDb()
    await browseAgents(capped.db, request('?max_price=1900'))
    expect(findCall(capped.calls, 'lte', 'price_cents')?.args[1]).toBe(1900)

    const free = fakeDb()
    await browseAgents(free.db, request('?free=true'))
    expect(findCall(free.calls, 'eq', 'price_cents')?.args[1]).toBe(0)
  })

  it('clamps per_page to the maximum page size', async () => {
    const { db, calls } = fakeDb()
    await browseAgents(db, request('?per_page=5000'))

    const range = findCall(calls, 'range')
    // 0..99 is 100 rows, the hard ceiling.
    expect(range?.args).toEqual([0, 99])
  })

  it('computes the range for a later page', async () => {
    const { db, calls } = fakeDb()
    await browseAgents(db, request('?page=3&per_page=10'))
    expect(findCall(calls, 'range')?.args).toEqual([20, 29])
  })

  it('returns the rows and pagination metadata', async () => {
    const { db } = fakeDb()
    const result = await browseAgents(db, request('?page=2&per_page=12'))

    expect(result.items).toEqual([{ id: 'a1' }])
    expect(result.meta).toEqual({ total: 1, page: 2, per_page: 12 })
  })
})
