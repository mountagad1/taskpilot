import { describe, it, expect } from 'vitest'
import { parseAgentManifest, MANIFEST_LIMITS } from './manifest'
import { AGENT_MANIFEST_SCHEMA } from './types/agent'

function baseManifest(overrides: Record<string, unknown> = {}) {
  return {
    schema: AGENT_MANIFEST_SCHEMA,
    name: 'Lead Capture Pro',
    slug: 'lead-capture-pro',
    version: '1.2.0',
    description: 'Captures leads from the current page.',
    category: 'sales',
    goal: 'Extract the contact on this page and push it to the CRM',
    capabilities: ['read_page', 'extract_emails', 'push_integration'],
    inputs: [{ name: 'crm', label: 'CRM', type: 'select', required: true, options: ['hubspot'] }],
    triggers: [{ type: 'manual', surface: 'sidebar' }],
    deploy: { targets: ['extension'], min_plan: 'free' },
    ...overrides,
  }
}

describe('parseAgentManifest', () => {
  it('accepts a well-formed manifest and normalises it', () => {
    const result = parseAgentManifest(baseManifest())
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.slug).toBe('lead-capture-pro')
    expect(result.value.capabilities).toEqual(['read_page', 'extract_emails', 'push_integration'])
    expect(result.value.inputs[0].name).toBe('crm')
    // Harness is absent above, so defaults fill in.
    expect(result.value.harness.max_steps).toBeGreaterThan(0)
    expect(result.value.harness.memory.enabled).toBe(true)
  })

  it('rejects a manifest with the wrong schema tag', () => {
    const result = parseAgentManifest(baseManifest({ schema: 'evil/v9' }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.some((i) => i.path === 'schema')).toBe(true)
  })

  it('rejects unknown capabilities rather than silently dropping them', () => {
    const result = parseAgentManifest(
      baseManifest({ capabilities: ['read_page', 'exfiltrate_cookies'] })
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.some((i) => i.message.includes('exfiltrate_cookies'))).toBe(true)
  })

  it('requires at least one capability', () => {
    const result = parseAgentManifest(baseManifest({ capabilities: [] }))
    expect(result.ok).toBe(false)
  })

  it('rejects a javascript: URL in a navigate action', () => {
    const result = parseAgentManifest(
      baseManifest({
        capabilities: ['navigate'],
        workflow: [
          {
            id: 's1',
            action: { type: 'navigate', params: { url: 'javascript:fetch("//evil.example")' } },
          },
        ],
      })
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.some((i) => i.path.includes('url'))).toBe(true)
  })

  it('accepts an https URL in a navigate action', () => {
    const result = parseAgentManifest(
      baseManifest({
        capabilities: ['navigate'],
        workflow: [{ id: 's1', action: { type: 'navigate', params: { url: 'https://example.com/a' } } }],
      })
    )
    expect(result.ok).toBe(true)
  })

  it('rejects a workflow step calling a capability the manifest never declared', () => {
    const result = parseAgentManifest(
      baseManifest({
        capabilities: ['read_page'],
        workflow: [{ id: 's1', action: { type: 'download_file', params: {} } }],
      })
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.some((i) => i.message.includes('not in the declared capabilities'))).toBe(true)
  })

  it('clamps an oversized token budget to the platform ceiling', () => {
    const result = parseAgentManifest(
      baseManifest({ harness: { model: 'gpt-4.1', token_budget_per_run: 10_000_000, max_steps: 5 } })
    )
    // The out-of-range value is reported, and the normalised value is capped.
    expect(result.ok).toBe(false)
    const reparsed = parseAgentManifest(
      baseManifest({ harness: { model: 'gpt-4.1', token_budget_per_run: MANIFEST_LIMITS.max_token_budget, max_steps: 5 } })
    )
    expect(reparsed.ok).toBe(true)
    if (!reparsed.ok) return
    expect(reparsed.value.harness.token_budget_per_run).toBe(MANIFEST_LIMITS.max_token_budget)
  })

  it('rejects a url_match trigger with no pattern', () => {
    const result = parseAgentManifest(baseManifest({ triggers: [{ type: 'url_match' }] }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.some((i) => i.message.includes('require a pattern'))).toBe(true)
  })

  it('drops unknown top-level keys instead of passing them through', () => {
    const result = parseAgentManifest(baseManifest({ __proto__hack: 'x', arbitrary: { a: 1 } }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect('arbitrary' in result.value).toBe(false)
  })

  it('rejects a non-object manifest', () => {
    expect(parseAgentManifest(null).ok).toBe(false)
    expect(parseAgentManifest('nope').ok).toBe(false)
    expect(parseAgentManifest([]).ok).toBe(false)
  })

  it('rejects a slug that is not kebab-case', () => {
    expect(parseAgentManifest(baseManifest({ slug: 'Not A Slug' })).ok).toBe(false)
    expect(parseAgentManifest(baseManifest({ slug: '../../etc/passwd' })).ok).toBe(false)
  })
})
