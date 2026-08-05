import { describe, it, expect } from 'vitest'
import { parseCron, validateCron, nextCronRun, describeCron } from './cron'

describe('validateCron', () => {
  it.each([
    ['* * * * *'],
    ['0 9 * * 1-5'],
    ['*/15 * * * *'],
    ['0 0 1 * *'],
    ['30 6,18 * * *'],
    ['0 0 1,15 1-6/2 *'],
  ])('accepts %s', (expression) => {
    expect(validateCron(expression)).toBeNull()
  })

  it.each([
    ['* * * *', /5 fields/],
    ['60 * * * *', /minutes field must be between/],
    ['* 24 * * *', /hours field must be between/],
    ['* * 0 * *', /daysOfMonth field must be between/],
    ['* * * 13 *', /months field must be between/],
    ['* * * * 7', /daysOfWeek field must be between/],
    ['*/0 * * * *', /Invalid step/],
    ['x * * * *', /Invalid value/],
    ['10-5 * * * *', /must be between/],
  ])('rejects %s', (expression, pattern) => {
    expect(validateCron(expression)).toMatch(pattern)
  })
})

describe('parseCron', () => {
  it('expands a step over a wildcard', () => {
    expect(parseCron('*/15 * * * *').minutes).toEqual([0, 15, 30, 45])
  })

  it('expands a stepped range', () => {
    expect(parseCron('0 0 * 1-6/2 *').months).toEqual([1, 3, 5])
  })

  it('treats a bare value with a step as open-ended', () => {
    // "5/10" means "from 5, every 10" — 5, 15, 25, 35, 45, 55.
    expect(parseCron('5/10 * * * *').minutes).toEqual([5, 15, 25, 35, 45, 55])
  })

  it('unions a comma-separated list and sorts it', () => {
    expect(parseCron('30,0,15 * * * *').minutes).toEqual([0, 15, 30])
  })
})

describe('nextCronRun', () => {
  const from = new Date('2026-03-10T08:20:30.000Z') // a Tuesday

  it('returns the next matching minute, with seconds zeroed', () => {
    const next = nextCronRun('*/15 * * * *', from)
    expect(next.toISOString()).toBe('2026-03-10T08:30:00.000Z')
  })

  it('is strictly in the future, never the current minute', () => {
    const exact = new Date('2026-03-10T08:30:00.000Z')
    expect(nextCronRun('*/15 * * * *', exact).toISOString()).toBe('2026-03-10T08:45:00.000Z')
  })

  it('rolls over to the next day', () => {
    const next = nextCronRun('0 6 * * *', from)
    expect(next.toISOString()).toBe('2026-03-11T06:00:00.000Z')
  })

  it('honours a weekday restriction', () => {
    // Friday 09:00 from a Tuesday.
    const next = nextCronRun('0 9 * * 5', from)
    expect(next.getUTCDay()).toBe(5)
    expect(next.toISOString()).toBe('2026-03-13T09:00:00.000Z')
  })

  it('ORs day-of-month against day-of-week when both are restricted', () => {
    // "the 1st, or any Monday" — the 16th is the next Monday.
    const next = nextCronRun('0 0 1 * 1', from)
    expect(next.toISOString()).toBe('2026-03-16T00:00:00.000Z')
  })

  it('skips a month that lacks the requested day', () => {
    // 30th of February never exists; the next 30th is in March.
    const feb = new Date('2026-02-15T00:00:00.000Z')
    const next = nextCronRun('0 0 30 * *', feb)
    expect(next.getUTCMonth()).toBe(2)
    expect(next.getUTCDate()).toBe(30)
  })

  it('throws rather than looping forever on an impossible expression', () => {
    // The 31st of February: valid syntax, no occurrence.
    expect(() => nextCronRun('0 0 31 2 *', from)).toThrow(/no next occurrence/i)
  })
})

describe('describeCron', () => {
  it('summarises common schedules in plain English', () => {
    expect(describeCron('* * * * *')).toBe('Every minute')
    expect(describeCron('30 * * * *')).toBe('Hourly at :30')
    expect(describeCron('0 9 * * *')).toBe('Daily at 09:00 UTC')
    expect(describeCron('0 9 * * 1')).toContain('Mon')
  })

  it('falls back to the raw expression when it cannot summarise', () => {
    expect(describeCron('not a cron')).toBe('Cron: not a cron')
  })
})
