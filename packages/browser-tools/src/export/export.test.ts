import { describe, it, expect } from 'vitest'
import { toRows, toCSV, toJSON, toMarkdown, deriveHeaders, serialiseExport, sanitiseFilename } from './index'

describe('toRows', () => {
  it('wraps an array of scalars into a single-column sheet', () => {
    expect(toRows(['a@x.test', 'b@x.test'])).toEqual([{ value: 'a@x.test' }, { value: 'b@x.test' }])
  })

  it('passes an array of objects through', () => {
    expect(toRows([{ a: 1 }, { a: 2 }])).toEqual([{ a: 1 }, { a: 2 }])
  })

  it('flattens TableData into header-keyed records', () => {
    expect(
      toRows({ headers: ['Name', 'Email'], rows: [['Ada', 'ada@x.test']], row_count: 1, element_selector: 'table' })
    ).toEqual([{ Name: 'Ada', Email: 'ada@x.test' }])
  })

  it('wraps a lone object and a lone scalar', () => {
    expect(toRows({ a: 1 })).toEqual([{ a: 1 }])
    expect(toRows('hello')).toEqual([{ value: 'hello' }])
  })

  it('returns an empty array for null, undefined and []', () => {
    expect(toRows(null)).toEqual([])
    expect(toRows(undefined)).toEqual([])
    expect(toRows([])).toEqual([])
  })
})

describe('deriveHeaders', () => {
  it('unions keys across sparse rows in first-seen order', () => {
    expect(deriveHeaders([{ a: 1 }, { b: 2 }, { a: 3, c: 4 }])).toEqual(['a', 'b', 'c'])
  })
})

describe('toCSV', () => {
  it('emits a BOM so Excel reads UTF-8', () => {
    expect(toCSV([{ a: 'é' }]).charCodeAt(0)).toBe(0xfeff)
  })

  it('quotes cells containing commas, quotes or newlines', () => {
    const csv = toCSV([{ note: 'a,b' }, { note: 'say "hi"' }, { note: 'line1\nline2' }])
    expect(csv).toContain('"a,b"')
    expect(csv).toContain('"say ""hi"""')
    expect(csv).toContain('"line1\nline2"')
  })

  it('neutralises leading characters Excel would treat as a formula', () => {
    const csv = toCSV([{ v: '=1+1' }, { v: '+cmd' }, { v: '@SUM(A1)' }, { v: '-2' }])
    // Each dangerous cell is prefixed with an apostrophe so the spreadsheet
    // renders it as text instead of evaluating it.
    expect(csv).toContain("'=1+1")
    expect(csv).toContain("'+cmd")
    expect(csv).toContain("'@SUM(A1)")
    expect(csv).toContain("'-2")
  })

  it('keeps sparse rows aligned to the union of headers', () => {
    const csv = toCSV([{ a: 1 }, { b: 2 }])
    const [header, first, second] = csv.replace('﻿', '').split('\r\n')
    expect(header).toBe('a,b')
    expect(first).toBe('1,')
    expect(second).toBe(',2')
  })

  it('returns an empty string for no rows', () => {
    expect(toCSV([])).toBe('')
  })
})

describe('toJSON and toMarkdown', () => {
  it('serialises rows as indented JSON', () => {
    expect(JSON.parse(toJSON([{ a: 1 }]))).toEqual([{ a: 1 }])
  })

  it('escapes pipes and newlines in a markdown table', () => {
    const md = toMarkdown([{ v: 'a|b' }, { v: 'x\ny' }])
    expect(md).toContain('a\\|b')
    expect(md).toContain('x y')
    expect(md.split('\n')[1]).toBe('| --- |')
  })
})

describe('serialiseExport', () => {
  it('names the file and sets the content type per format', () => {
    const csv = serialiseExport('csv', [{ a: 1 }], { filename: 'my report' })
    expect(csv.filename).toBe('my-report.csv')
    expect(csv.contentType).toContain('text/csv')

    const json = serialiseExport('json', [{ a: 1 }], { filename: 'data' })
    expect(json.filename).toBe('data.json')
  })
})

describe('sanitiseFilename', () => {
  it('strips path separators and other unsafe characters', () => {
    expect(sanitiseFilename('../../etc/passwd')).not.toContain('/')
    expect(sanitiseFilename('a:b*c?d"e<f>g|h')).not.toMatch(/[:*?"<>|]/)
  })

  it('falls back to a default when nothing usable remains', () => {
    expect(sanitiseFilename('///')).toBe('taskpilot-export')
    expect(sanitiseFilename('')).toBe('taskpilot-export')
  })
})
