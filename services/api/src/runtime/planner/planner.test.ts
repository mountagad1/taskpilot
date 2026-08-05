import { describe, it, expect } from 'vitest'
import type { PageContext } from '@taskpilot/shared'
import { Planner, safeParseJSON } from './index'
import { matchHeuristicPlan } from './heuristics'
import { MockProvider } from '../providers/mock'

function context(overrides: Partial<PageContext> = {}): PageContext {
  return {
    url: 'https://example.com/article',
    title: 'An article',
    visible_text: 'Contact us at hello@example.com. Price: $42.00',
    detected_forms: [],
    detected_tables: [],
    page_type: 'article',
    domain: 'example.com',
    ...overrides,
  }
}

describe('heuristic planner', () => {
  it('matches a summarise request without a model call', () => {
    const match = matchHeuristicPlan('summarize this page', context())
    expect(match).not.toBeNull()
    expect(match!.rule).toBe('summarize')
    expect(match!.steps.map((s) => s.action.type)).toEqual(['read_page', 'summarize', 'finish'])
  })

  it('extracts the target language from a translate request', () => {
    const match = matchHeuristicPlan('translate this into spanish', context())
    expect(match!.rule).toBe('translate')
    const translate = match!.steps.find((s) => s.action.type === 'translate')
    expect(translate!.action.params!.target_language).toBe('spanish')
  })

  it('appends an export step when a format is named', () => {
    const match = matchHeuristicPlan('get all the emails and export as csv', context())
    expect(match!.rule).toBe('extract_emails')
    const types = match!.steps.map((s) => s.action.type)
    expect(types).toContain('export_data')
    const exportStep = match!.steps.find((s) => s.action.type === 'export_data')
    expect(exportStep!.action.params!.format).toBe('csv')
  })

  it('maps "xlsx" and "spreadsheet" to the excel format', () => {
    const match = matchHeuristicPlan('extract the table to xlsx', context())
    const exportStep = match!.steps.find((s) => s.action.type === 'export_data')
    expect(exportStep!.action.params!.format).toBe('excel')
  })

  it('does not treat "reply to this email" as an email extraction', () => {
    const match = matchHeuristicPlan('write a reply to this email', context())
    expect(match!.rule).toBe('generate_reply')
  })

  it('declines multi-clause requests so the LLM planner handles them', () => {
    expect(matchHeuristicPlan('summarize this then translate it to french', context())).toBeNull()
    expect(matchHeuristicPlan('extract the emails and then push them to hubspot', context())).toBeNull()
  })

  it('returns null for a request no rule covers', () => {
    expect(matchHeuristicPlan('book me a flight to Lisbon next tuesday', context())).toBeNull()
  })

  it('returns null for an empty goal', () => {
    expect(matchHeuristicPlan('   ', context())).toBeNull()
  })
})

describe('Planner', () => {
  it('uses heuristics and spends no tokens on a common request', async () => {
    const provider = new MockProvider()
    const planner = new Planner({ provider })

    const { plan, usage } = await planner.plan({ goal: 'summarize this page', context: context() })

    expect(plan.source).toBe('heuristic')
    expect(usage).toBeNull()
    expect(provider.calls).toHaveLength(0)
  })

  it('falls back to the LLM for an uncovered request', async () => {
    const provider = new MockProvider({
      responses: [
        JSON.stringify({
          steps: [
            { id: 'a', action: { type: 'read_page' }, save_as: 'page' },
            { id: 'b', action: { type: 'ask_ai', params: { question: 'who founded this company' } }, save_as: 'answer' },
            { id: 'c', action: { type: 'finish', params: { result: 'answer' } } },
          ],
          confidence: 0.8,
        }),
      ],
    })
    const planner = new Planner({ provider })

    const { plan, usage } = await planner.plan({
      goal: 'who founded the company described on this page',
      context: context(),
    })

    expect(plan.source).toBe('llm')
    expect(plan.steps.map((s) => s.action.type)).toEqual(['read_page', 'ask_ai', 'finish'])
    expect(plan.confidence).toBe(0.8)
    expect(usage!.total_tokens).toBeGreaterThan(0)
  })

  it('truncates the plan at the first action outside the allowed list', async () => {
    const provider = new MockProvider({
      responses: [
        JSON.stringify({
          steps: [
            { id: 'a', action: { type: 'read_page' }, save_as: 'page' },
            { id: 'b', action: { type: 'download_file', params: { url: 'https://x.test/f.pdf' } } },
            { id: 'c', action: { type: 'finish' } },
          ],
          confidence: 0.9,
        }),
      ],
    })
    const planner = new Planner({ provider, allowedActions: ['read_page', 'ask_ai'] })

    const { plan } = await planner.plan({ goal: 'grab the attached report', context: context() })

    // download_file is dropped, and everything after it too, then a finish
    // step is appended so the plan still terminates cleanly.
    expect(plan.steps.map((s) => s.action.type)).toEqual(['read_page', 'finish'])
  })

  it('surfaces a clarification request instead of inventing steps', async () => {
    const provider = new MockProvider({
      responses: [JSON.stringify({ steps: [], confidence: 0, clarification_needed: 'Which invoice?' })],
    })
    const planner = new Planner({ provider })

    const { plan } = await planner.plan({ goal: 'send the invoice', context: context() })

    expect(plan.clarification_needed).toBe('Which invoice?')
    expect(plan.steps).toHaveLength(0)
  })

  it('lowers confidence when the model response needed repair', async () => {
    const provider = new MockProvider({
      responses: [
        JSON.stringify({
          steps: [
            // `by` is invalid and gets defaulted — a repair, so confidence drops.
            { id: 'a', action: { type: 'click', target: { by: 'psychic', value: '.btn' } } },
            { id: 'b', action: { type: 'finish' } },
          ],
          confidence: 0.95,
        }),
      ],
    })
    const planner = new Planner({ provider })

    const { plan } = await planner.plan({ goal: 'press the confirm control', context: context() })
    expect(plan.confidence).toBeLessThanOrEqual(0.4)
  })

  it('skips heuristics when replanning with feedback', async () => {
    const provider = new MockProvider({
      responses: [JSON.stringify({ steps: [{ id: 'a', action: { type: 'finish' } }], confidence: 0.6 })],
    })
    const planner = new Planner({ provider })

    // "summarize this page" would normally match a heuristic rule.
    const { plan } = await planner.plan({
      goal: 'summarize this page',
      context: context(),
      feedback: 'The page had no readable content.',
    })

    expect(plan.source).toBe('llm')
    expect(provider.calls).toHaveLength(1)
    expect(provider.calls[0].messages[1].content).toContain('PREVIOUS ATTEMPT FAILED')
  })

  it('reports a clarification when no provider is configured and no rule matches', async () => {
    const planner = new Planner()
    const { plan } = await planner.plan({ goal: 'do something bespoke', context: context() })
    expect(plan.clarification_needed).toMatch(/no model provider/i)
  })
})

describe('safeParseJSON', () => {
  it('parses plain JSON', () => {
    expect(safeParseJSON('{"a":1}')).toEqual({ a: 1 })
  })

  it('parses JSON wrapped in a markdown fence', () => {
    expect(safeParseJSON('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })

  it('parses JSON surrounded by prose', () => {
    expect(safeParseJSON('Sure! Here you go: {"a":1} Hope that helps.')).toEqual({ a: 1 })
  })

  it('returns null for a bare array or non-JSON', () => {
    expect(safeParseJSON('[1,2,3]')).toBeNull()
    expect(safeParseJSON('not json at all')).toBeNull()
  })
})
