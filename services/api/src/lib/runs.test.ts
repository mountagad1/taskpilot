import { describe, it, expect } from 'vitest'
import { sanitisePageContext } from './runs'

describe('sanitisePageContext', () => {
  it('keeps a well-formed context intact', () => {
    const context = sanitisePageContext({
      url: 'https://example.com/page',
      title: 'A page',
      visible_text: 'body copy',
      page_type: 'article',
      detected_forms: [{ type: 'text', required: false, confidence: 1, element_selector: '#a' }],
      detected_tables: [],
    })

    expect(context.url).toBe('https://example.com/page')
    expect(context.title).toBe('A page')
    expect(context.page_type).toBe('article')
    expect(context.detected_forms).toHaveLength(1)
  })

  it('derives the domain from the URL when it is absent', () => {
    expect(sanitisePageContext({ url: 'https://sub.example.co.uk/x' }).domain).toBe('sub.example.co.uk')
  })

  it('leaves the domain empty for an unparseable URL rather than throwing', () => {
    expect(sanitisePageContext({ url: 'not a url' }).domain).toBe('')
  })

  it('truncates oversized text so a hostile page cannot blow up the prompt', () => {
    const context = sanitisePageContext({
      url: 'https://example.com',
      visible_text: 'x'.repeat(500_000),
      title: 'y'.repeat(5000),
    })

    expect(context.visible_text.length).toBe(20_000)
    expect(context.title.length).toBe(500)
  })

  it('caps the number of forms and tables', () => {
    const context = sanitisePageContext({
      url: 'https://example.com',
      detected_forms: Array.from({ length: 500 }, () => ({ type: 'text' })),
      detected_tables: Array.from({ length: 500 }, () => ({ headers: [], rows: [] })),
    })

    expect(context.detected_forms).toHaveLength(100)
    expect(context.detected_tables).toHaveLength(20)
  })

  it('coerces non-string and missing fields to safe defaults', () => {
    const context = sanitisePageContext({ url: 12345, title: null, visible_text: { a: 1 } })

    expect(context.url).toBe('')
    expect(context.title).toBe('')
    expect(context.visible_text).toBe('')
    expect(context.detected_forms).toEqual([])
  })

  it('handles null and undefined input', () => {
    expect(sanitisePageContext(null).url).toBe('')
    expect(sanitisePageContext(undefined).page_type).toBe('generic')
  })

  it('drops selected_text and meta_description when they are empty', () => {
    const context = sanitisePageContext({ url: 'https://example.com', selected_text: '' })
    expect(context.selected_text).toBeUndefined()
    expect(context.meta_description).toBeUndefined()
  })
})
