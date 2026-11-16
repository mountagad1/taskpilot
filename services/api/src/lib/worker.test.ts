// ============================================================
// TASKPILOT API — WORKER TESTS
// services/api/src/lib/worker.test.ts
// ============================================================

import { describe, it, expect } from 'vitest'

import { resolveBatchSize, vetScheduledRun, DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE } from './worker'

describe('vetScheduledRun', () => {
  it('pauses a schedule whose owner is now on the free plan', () => {
    const verdict = vetScheduledRun({ plan: 'free', scheduled: true, actions: ['read_page'] })
    expect(verdict?.pause).toBe(true)
    expect(verdict?.reason).toMatch(/Pro plan/)
  })

  it('skips (without pausing) a run whose steps exceed the plan', () => {
    const verdict = vetScheduledRun({ plan: 'free', scheduled: false, actions: ['read_page', 'screenshot'] })
    expect(verdict).toEqual({ reason: expect.stringContaining('screenshot'), pause: false })
  })

  it('lets a Pro owner run Pro steps on a schedule', () => {
    expect(vetScheduledRun({ plan: 'pro', scheduled: true, actions: ['read_page', 'screenshot', 'finish'] })).toBeNull()
  })
})

describe('resolveBatchSize', () => {
  it('passes a sensible value through', () => {
    expect(resolveBatchSize(5)).toBe(5)
    expect(resolveBatchSize('7')).toBe(7)
  })

  it('defaults when nothing is supplied', () => {
    expect(resolveBatchSize(undefined)).toBe(DEFAULT_BATCH_SIZE)
    expect(resolveBatchSize(null)).toBe(DEFAULT_BATCH_SIZE)
  })

  it('defaults on a non-numeric value rather than producing NaN', () => {
    // The bug this replaced: `?? 10` does not fire for NaN, and neither
    // Math.max nor Math.min clamps it. NaN then serialises to JSON null,
    // and `LIMIT NULL` in Postgres means no limit at all — so one bad
    // ?batch= claimed the whole queue into a single worker.
    for (const bad of ['abc', '', ' ', {}, [], NaN, Infinity, -Infinity, null, undefined]) {
      expect(resolveBatchSize(bad)).toBe(DEFAULT_BATCH_SIZE)
    }
  })

  it('never returns a value Postgres would read as unlimited', () => {
    for (const input of ['abc', NaN, Infinity, null, undefined, -1, 0]) {
      const size = resolveBatchSize(input)
      expect(Number.isInteger(size)).toBe(true)
      expect(size).toBeGreaterThanOrEqual(1)
      expect(size).toBeLessThanOrEqual(MAX_BATCH_SIZE)
    }
  })

  it('clamps to the bounds', () => {
    expect(resolveBatchSize(0)).toBe(1)
    expect(resolveBatchSize(-9)).toBe(1)
    expect(resolveBatchSize(9999)).toBe(MAX_BATCH_SIZE)
  })

  it('truncates a fractional value', () => {
    // A float reaches Postgres as a float and LIMIT rejects it.
    expect(resolveBatchSize(7.9)).toBe(7)
    expect(resolveBatchSize('3.5')).toBe(3)
  })
})
