import { describe, it, expect } from 'vitest'
import { defineAgent, AgentDefinitionError, StepBuilder, looksLikeSelector } from './define'

describe('defineAgent', () => {
  it('builds a valid manifest from a workflow', () => {
    const manifest = defineAgent({
      name: 'Lead Capture Pro',
      goal: 'Capture the contact on this page and push it to the CRM',
      category: 'sales',
    })
      .describe('Turns a profile page into a CRM contact.')
      .workflow((s) => {
        s.readPage('page')
          .extractStructured(['name', 'email', 'company'], 'contact')
          .pushTo('hubspot', 'contact')
          .finish('contact')
      })
      .build()

    expect(manifest.slug).toBe('lead-capture-pro')
    expect(manifest.version).toBe('1.0.0')
    expect(manifest.workflow).toHaveLength(4)
    // Capabilities are derived from the workflow rather than hand-declared.
    expect(manifest.capabilities).toEqual(
      expect.arrayContaining(['read_page', 'extract_structured', 'push_integration'])
    )
    expect(manifest.capabilities).not.toContain('finish')
  })

  it('merges explicitly declared capabilities with the derived ones', () => {
    const manifest = defineAgent({ name: 'Mixed', goal: 'Do a couple of things' })
      .can('screenshot')
      .workflow((s) => s.readPage().finish('page'))
      .build()

    expect(manifest.capabilities).toEqual(expect.arrayContaining(['screenshot', 'read_page']))
  })

  it('defaults to a manual sidebar trigger', () => {
    const manifest = defineAgent({ name: 'Trigger test', goal: 'Read the page' })
      .workflow((s) => s.readPage().finish('page'))
      .build()

    expect(manifest.triggers).toEqual([{ type: 'manual', surface: 'sidebar' }])
  })

  it('applies harness overrides while keeping the memory defaults', () => {
    const manifest = defineAgent({ name: 'Budgeted', goal: 'Read the page' })
      .harness({ max_steps: 5, token_budget_per_run: 1000 })
      .workflow((s) => s.readPage().finish('page'))
      .build()

    expect(manifest.harness.max_steps).toBe(5)
    expect(manifest.harness.token_budget_per_run).toBe(1000)
    expect(manifest.harness.memory.enabled).toBe(true)
  })

  it('rejects an agent with no capabilities', () => {
    expect(() => defineAgent({ name: 'Empty', goal: 'Do nothing at all' }).build()).toThrow(
      AgentDefinitionError
    )
  })

  it('reports every validation problem at once', () => {
    try {
      // A one-character goal, and no capabilities.
      defineAgent({ name: 'X', goal: 'a' }).build()
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(AgentDefinitionError)
      const issues = (err as AgentDefinitionError).issues
      expect(issues.length).toBeGreaterThan(1)
      expect(issues.some((i) => i.path === 'goal')).toBe(true)
      expect(issues.some((i) => i.path === 'capabilities')).toBe(true)
    }
  })

  it('refuses a javascript: URL in a navigate step', () => {
    expect(() =>
      defineAgent({ name: 'Sneaky', goal: 'Navigate somewhere unpleasant' })
        .workflow((s) => s.navigate('javascript:alert(1)').finish())
        .build()
    ).toThrow(AgentDefinitionError)
  })

  it('accepts an https navigate step', () => {
    const manifest = defineAgent({ name: 'Fine', goal: 'Navigate somewhere reasonable' })
      .workflow((s) => s.navigate('https://example.com').finish())
      .build()

    expect(manifest.workflow![0].action.params!.url).toBe('https://example.com/')
  })
})

describe('StepBuilder target inference', () => {
  it('treats a CSS-looking string as a selector', () => {
    const steps = new StepBuilder().click('#save-button').toArray()
    expect(steps[0].action.target).toEqual({ by: 'css', value: '#save-button' })
  })

  it('treats a human phrase as visible text', () => {
    const steps = new StepBuilder().click('Save changes').toArray()
    expect(steps[0].action.target).toEqual({ by: 'text', value: 'Save changes' })
  })

  it('passes an explicit target through untouched', () => {
    const steps = new StepBuilder().click({ by: 'label', value: 'Email address' }).toArray()
    expect(steps[0].action.target).toEqual({ by: 'label', value: 'Email address' })
  })

  it.each([
    ['#save', true],
    ['.btn-primary', true],
    ['[data-testid="go"]', true],
    ['div > span', true],
    ['button.primary', true],
    ['input:checked', true],
    ['button', true],
    ['Save changes', false],
    ['Continue', false],
    ['Add to cart', false],
    ['Sign in with Google', false],
  ])('classifies %s correctly', (value, expected) => {
    expect(looksLikeSelector(value)).toBe(expected)
  })
})

describe('StepBuilder', () => {
  it('numbers steps and honours explicit ids', () => {
    const steps = new StepBuilder().readPage().click('#a', { id: 'the-click' }).toArray()
    expect(steps.map((s) => s.id)).toEqual(['step_1', 'the-click'])
  })

  it('wires an export to a saved value with a scratchpad reference', () => {
    const steps = new StepBuilder().extractEmails('emails').export('emails', 'csv').toArray()
    expect(steps[1].action.params!.rows).toBe('{{emails}}')
    expect(steps[1].action.params!.format).toBe('csv')
  })

  it('carries step options into the plan step', () => {
    const steps = new StepBuilder()
      .click('#maybe', { optional: true, retry: { max_attempts: 3, backoff_ms: 200 } })
      .toArray()

    expect(steps[0].optional).toBe(true)
    expect(steps[0].retry).toEqual({ max_attempts: 3, backoff_ms: 200 })
  })

  it('excludes finish from the derived capability list', () => {
    const builder = new StepBuilder().readPage().finish('page')
    expect(builder.capabilities()).toEqual(['read_page'])
  })
})
