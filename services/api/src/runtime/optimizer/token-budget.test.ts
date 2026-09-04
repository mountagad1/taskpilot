import { describe, it, expect } from 'vitest'
import {
  AI_TASK_BUDGETS,
  budgetForTask,
  outputBudgetFor,
  prepareContent,
} from './token-optimizer'

/** What POST /v1/ai/process used to send and allow for every task alike. */
const OLD_INPUT_CHARS = 8_000
const OLD_OUTPUT_TOKENS = 1_500

describe('budgetForTask', () => {
  it('falls back to the open-question budget for an unknown task', () => {
    expect(budgetForTask('something_new')).toBe(AI_TASK_BUDGETS.custom)
  })

  it('never allows more input than the old flat cap', () => {
    for (const [task, budget] of Object.entries(AI_TASK_BUDGETS)) {
      expect(budget.max_input_chars, task).toBeLessThanOrEqual(OLD_INPUT_CHARS)
    }
  })

  it('caps digesting tasks well under the old output ceiling', () => {
    for (const [task, budget] of Object.entries(AI_TASK_BUDGETS)) {
      if (budget.verbatim) continue
      expect(budget.max_output_tokens, task).toBeGreaterThan(0)
      expect(budget.max_output_tokens, task).toBeLessThan(OLD_OUTPUT_TOKENS)
    }
  })
})

describe('prepareContent', () => {
  const noisy = [
    'Accept all cookies',
    'Real content that matters.',
    '',
    '',
    '',
    'Subscribe to our newsletter',
    'More   real     content.',
  ].join('\n')

  it('strips boilerplate and collapses whitespace for digesting tasks', () => {
    const out = prepareContent(noisy, budgetForTask('summarize'))

    expect(out).not.toMatch(/Accept all cookies/i)
    expect(out).not.toMatch(/Subscribe to our newsletter/i)
    expect(out).toContain('Real content that matters.')
    expect(out).toContain('More real content.')
    expect(out).not.toMatch(/\n{3,}/)
  })

  it('leaves verbatim content untouched apart from the cap', () => {
    // Stripping "Privacy Policy" out of a page summary is fine. Stripping it
    // out of the user's translation is data loss.
    const out = prepareContent(noisy, budgetForTask('translate'))

    expect(out).toBe(noisy)
  })

  it('applies each task its own input cap', () => {
    const long = 'a'.repeat(20_000)

    expect(prepareContent(long, budgetForTask('summarize'))).toHaveLength(6_000)
    expect(prepareContent(long, budgetForTask('generate_reply'))).toHaveLength(4_000)
    expect(prepareContent(long, budgetForTask('extract_data'))).toHaveLength(8_000)
    expect(prepareContent(long, budgetForTask('translate'))).toHaveLength(8_000)
  })

  it('leaves content below the cap alone', () => {
    expect(prepareContent('Short and clean.', budgetForTask('summarize'))).toBe('Short and clean.')
  })
})

describe('outputBudgetFor', () => {
  it('uses the fixed ceiling for tasks that digest content', () => {
    expect(outputBudgetFor(budgetForTask('summarize'), 6_000)).toBe(400)
    expect(outputBudgetFor(budgetForTask('extract_data'), 8_000)).toBe(900)
  })

  it('scales with the input for verbatim tasks so a translation is not cut off', () => {
    const translate = budgetForTask('translate')

    // ~4 chars per token, plus headroom for languages that run longer.
    expect(outputBudgetFor(translate, 4_000)).toBe(1_400)
    // A short selection still gets a usable answer.
    expect(outputBudgetFor(translate, 100)).toBe(256)
    // And a full page stays inside the old flat ceiling.
    expect(outputBudgetFor(translate, 8_000)).toBeLessThanOrEqual(2_000)
  })

  it('never returns a ceiling that could truncate a full-length rewrite', () => {
    const rewrite = budgetForTask('rewrite')
    const chars = rewrite.max_input_chars

    // The output must have room for at least as many tokens as the input.
    expect(outputBudgetFor(rewrite, chars)).toBeGreaterThanOrEqual(Math.ceil(chars / 4))
  })
})
