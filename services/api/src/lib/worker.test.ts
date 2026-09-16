// ============================================================
// TASKPILOT API — WORKER TESTS
// services/api/src/lib/worker.test.ts
// ============================================================

import { describe, it, expect } from 'vitest'

import { resolveBatchSize, DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE } from './worker'

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
