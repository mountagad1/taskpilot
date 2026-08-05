import { describe, it, expect, vi } from 'vitest'
import type {
  ActionDispatcher,
  ActionResult,
  BrowserAction,
  PageContext,
  PlanStep,
  RuntimeEvent,
} from '@taskpilot/shared'

import { AgentRuntime } from './agent-runtime'
import { Planner } from './planner'
import { Reasoner } from './reasoner'
import { MockProvider } from './providers/mock'

// ─── FIXTURES ────────────────────────────────────────────────

function context(overrides: Partial<PageContext> = {}): PageContext {
  return {
    url: 'https://example.com',
    title: 'Example',
    visible_text: 'Reach us at team@example.com',
    detected_forms: [],
    detected_tables: [],
    page_type: 'generic',
    domain: 'example.com',
    ...overrides,
  }
}

/** Records every dispatched action and answers from a scripted table. */
class FakeDispatcher implements ActionDispatcher {
  readonly dispatched: BrowserAction[] = []

  constructor(
    private readonly responses: Partial<
      Record<string, Partial<ActionResult> | ((n: number) => Partial<ActionResult>)>
    > = {}
  ) {}

  private counts = new Map<string, number>()

  async dispatch(action: BrowserAction): Promise<ActionResult> {
    this.dispatched.push(action)
    const n = (this.counts.get(action.type) ?? 0) + 1
    this.counts.set(action.type, n)

    const scripted = this.responses[action.type]
    const resolved = typeof scripted === 'function' ? scripted(n) : scripted

    return {
      action: action.type,
      success: true,
      data: `${action.type}-result`,
      duration_ms: 1,
      ...resolved,
    }
  }

  async readContext(): Promise<PageContext> {
    return context()
  }
}

function workflow(...steps: PlanStep[]): PlanStep[] {
  return steps
}

function step(id: string, type: BrowserAction['type'], extra: Partial<PlanStep> = {}): PlanStep {
  return { id, action: { type }, ...extra }
}

function buildRuntime(
  dispatcher: ActionDispatcher,
  overrides: Partial<ConstructorParameters<typeof AgentRuntime>[0]> = {}
) {
  const events: RuntimeEvent[] = []
  const runtime = new AgentRuntime({
    planner: new Planner(),
    reasoner: new Reasoner(),
    dispatcher,
    onEvent: (e) => {
      events.push(e)
    },
    ...overrides,
  })
  return { runtime, events }
}

// ─── TESTS ───────────────────────────────────────────────────

describe('AgentRuntime — happy path', () => {
  it('executes a workflow in order and returns the named result', async () => {
    const dispatcher = new FakeDispatcher({
      extract_emails: { data: ['team@example.com'] },
    })
    const { runtime, events } = buildRuntime(dispatcher)

    const outcome = await runtime.run({
      goal: 'collect the emails',
      context: context(),
      workflow: workflow(
        step('read', 'read_page', { save_as: 'page' }),
        step('emails', 'extract_emails', { save_as: 'emails' }),
        { id: 'done', action: { type: 'finish', params: { result: 'emails' } } }
      ),
    })

    expect(outcome.run.status).toBe('completed')
    expect(outcome.run.output.result).toEqual(['team@example.com'])
    expect(dispatcher.dispatched.map((a) => a.type)).toEqual(['read_page', 'extract_emails'])
    expect(events.map((e) => e.type)).toContain('run_finished')
  })

  it('interpolates an earlier step output into a later step params', async () => {
    const dispatcher = new FakeDispatcher({ extract_emails: { data: ['a@x.test', 'b@x.test'] } })
    const { runtime } = buildRuntime(dispatcher)

    await runtime.run({
      goal: 'export the emails',
      context: context(),
      workflow: workflow(
        step('emails', 'extract_emails', { save_as: 'emails' }),
        {
          id: 'export',
          action: { type: 'export_data', params: { rows: '{{emails}}', format: 'csv' } },
          save_as: 'file',
        },
        { id: 'done', action: { type: 'finish', params: { result: 'file' } } }
      ),
    })

    const exportAction = dispatcher.dispatched.find((a) => a.type === 'export_data')
    expect(exportAction!.params!.rows).toEqual(['a@x.test', 'b@x.test'])
    expect(exportAction!.params!.format).toBe('csv')
  })

  it('completes without an explicit finish step', async () => {
    const dispatcher = new FakeDispatcher()
    const { runtime } = buildRuntime(dispatcher)

    const outcome = await runtime.run({
      goal: 'read it',
      context: context(),
      workflow: workflow(step('read', 'read_page', { save_as: 'page' })),
    })

    expect(outcome.run.status).toBe('completed')
    expect(outcome.run.output.page).toBe('read_page-result')
  })
})

describe('AgentRuntime — conditions and dependencies', () => {
  it('skips a step whose condition is not met', async () => {
    const dispatcher = new FakeDispatcher({ extract_emails: { data: [] } })
    const { runtime, events } = buildRuntime(dispatcher)

    await runtime.run({
      goal: 'export only if there is something to export',
      context: context(),
      workflow: workflow(
        step('emails', 'extract_emails', { save_as: 'emails' }),
        {
          id: 'export',
          action: { type: 'export_data', params: { format: 'csv' } },
          condition: { key: 'emails', op: 'exists' },
        },
        { id: 'done', action: { type: 'finish' } }
      ),
    })

    expect(dispatcher.dispatched.map((a) => a.type)).not.toContain('export_data')
    expect(events.some((e) => e.type === 'step_skipped')).toBe(true)
  })

  it('runs a conditional step when the condition holds', async () => {
    const dispatcher = new FakeDispatcher({ extract_emails: { data: ['a@x.test'] } })
    const { runtime } = buildRuntime(dispatcher)

    await runtime.run({
      goal: 'export if present',
      context: context(),
      workflow: workflow(
        step('emails', 'extract_emails', { save_as: 'emails' }),
        {
          id: 'export',
          action: { type: 'export_data', params: { format: 'csv' } },
          condition: { key: 'emails', op: 'exists' },
        },
        { id: 'done', action: { type: 'finish' } }
      ),
    })

    expect(dispatcher.dispatched.map((a) => a.type)).toContain('export_data')
  })

  it('skips a step whose declared dependency never produced a value', async () => {
    const dispatcher = new FakeDispatcher()
    const { runtime } = buildRuntime(dispatcher)

    await runtime.run({
      goal: 'dependent step',
      context: context(),
      workflow: workflow(
        { id: 'export', action: { type: 'export_data' }, depends_on: ['never_set'] },
        { id: 'done', action: { type: 'finish' } }
      ),
    })

    expect(dispatcher.dispatched.map((a) => a.type)).not.toContain('export_data')
  })
})

describe('AgentRuntime — failure handling', () => {
  it('retries a retryable failure then continues once it succeeds', async () => {
    const dispatcher = new FakeDispatcher({
      click: (n) =>
        n === 1
          ? { success: false, error: 'element not ready', retryable: true }
          : { success: true, data: 'clicked' },
    })
    const { runtime } = buildRuntime(dispatcher)

    const outcome = await runtime.run({
      goal: 'click the button',
      context: context(),
      workflow: workflow(
        { id: 'click', action: { type: 'click' }, retry: { max_attempts: 3, backoff_ms: 0 }, save_as: 'clicked' },
        { id: 'done', action: { type: 'finish', params: { result: 'clicked' } } }
      ),
    })

    expect(outcome.run.status).toBe('completed')
    expect(dispatcher.dispatched.filter((a) => a.type === 'click')).toHaveLength(2)
  })

  it('continues past an optional step that failed', async () => {
    const dispatcher = new FakeDispatcher({
      screenshot: { success: false, error: 'capture unavailable', retryable: false },
    })
    const { runtime } = buildRuntime(dispatcher)

    const outcome = await runtime.run({
      goal: 'read and maybe snapshot',
      context: context(),
      workflow: workflow(
        { id: 'shot', action: { type: 'screenshot' }, optional: true },
        step('read', 'read_page', { save_as: 'page' }),
        { id: 'done', action: { type: 'finish', params: { result: 'page' } } }
      ),
    })

    expect(outcome.run.status).toBe('completed')
    expect(outcome.run.output.result).toBe('read_page-result')
  })

  it('fails the run when a required step fails unrecoverably and no reasoner model exists', async () => {
    const dispatcher = new FakeDispatcher({
      click: { success: false, error: 'no such element', retryable: false },
    })
    const { runtime } = buildRuntime(dispatcher)

    const outcome = await runtime.run({
      goal: 'click a missing thing',
      context: context(),
      workflow: workflow(step('click', 'click'), { id: 'done', action: { type: 'finish' } }),
    })

    expect(outcome.run.status).toBe('failed')
    expect(outcome.run.error).toMatch(/no such element|no reasoning model/i)
  })

  it('treats a dispatcher that throws as a failed step rather than crashing the run', async () => {
    const dispatcher: ActionDispatcher = {
      async dispatch() {
        throw new Error('content script disconnected')
      },
    }
    const { runtime } = buildRuntime(dispatcher)

    const outcome = await runtime.run({
      goal: 'anything',
      context: context(),
      workflow: workflow(step('read', 'read_page'), { id: 'done', action: { type: 'finish' } }),
    })

    expect(outcome.run.status).toBe('failed')
    expect(outcome.run.error).toContain('content script disconnected')
  })
})

describe('AgentRuntime — budgets', () => {
  it('stops when the step budget is exhausted', async () => {
    const dispatcher = new FakeDispatcher()
    const { runtime } = buildRuntime(dispatcher, { limits: { max_steps: 2 } })

    const outcome = await runtime.run({
      goal: 'many steps',
      context: context(),
      workflow: workflow(
        step('a', 'read_page'),
        step('b', 'extract_links'),
        step('c', 'extract_emails'),
        step('d', 'extract_prices'),
        { id: 'done', action: { type: 'finish' } }
      ),
    })

    expect(outcome.run.status).toBe('failed')
    expect(outcome.run.error).toMatch(/step budget/i)
    expect(dispatcher.dispatched).toHaveLength(2)
  })

  it('cancels when the caller aborts', async () => {
    const controller = new AbortController()
    const dispatcher: ActionDispatcher = {
      async dispatch(action) {
        controller.abort()
        return { action: action.type, success: true, data: null, duration_ms: 1 }
      },
    }
    const { runtime } = buildRuntime(dispatcher)

    const outcome = await runtime.run({
      goal: 'long job',
      context: context(),
      signal: controller.signal,
      workflow: workflow(step('a', 'read_page'), step('b', 'extract_links'), {
        id: 'done',
        action: { type: 'finish' },
      }),
    })

    expect(outcome.run.status).toBe('cancelled')
  })

  it('times out a run that exceeds its wall clock', async () => {
    const dispatcher: ActionDispatcher = {
      async dispatch(action) {
        await new Promise((r) => setTimeout(r, 30))
        return { action: action.type, success: true, data: null, duration_ms: 30 }
      },
    }
    const { runtime } = buildRuntime(dispatcher, { limits: { timeout_ms: 20 } })

    const outcome = await runtime.run({
      goal: 'slow job',
      context: context(),
      workflow: workflow(step('a', 'read_page'), step('b', 'extract_links'), {
        id: 'done',
        action: { type: 'finish' },
      }),
    })

    expect(outcome.run.status).toBe('timed_out')
  })
})

describe('AgentRuntime — confirmation gating', () => {
  it('pauses before a navigate step when no confirmation handler is attached', async () => {
    const dispatcher = new FakeDispatcher()
    const { runtime, events } = buildRuntime(dispatcher)

    const outcome = await runtime.run({
      goal: 'go elsewhere',
      context: context(),
      workflow: workflow(
        { id: 'nav', action: { type: 'navigate', params: { url: 'https://elsewhere.test' } } },
        { id: 'done', action: { type: 'finish' } }
      ),
    })

    expect(outcome.run.status).toBe('awaiting_confirmation')
    expect(outcome.pendingConfirmation?.id).toBe('nav')
    expect(dispatcher.dispatched).toHaveLength(0)
    expect(events.some((e) => e.type === 'confirmation_required')).toBe(true)
  })

  it('proceeds when the confirmation handler approves', async () => {
    const dispatcher = new FakeDispatcher()
    const confirm = vi.fn().mockResolvedValue(true)
    const { runtime } = buildRuntime(dispatcher, { confirm })

    const outcome = await runtime.run({
      goal: 'go elsewhere',
      context: context(),
      workflow: workflow(
        { id: 'nav', action: { type: 'navigate', params: { url: 'https://elsewhere.test' } } },
        { id: 'done', action: { type: 'finish' } }
      ),
    })

    expect(confirm).toHaveBeenCalledOnce()
    expect(outcome.run.status).toBe('completed')
    expect(dispatcher.dispatched.map((a) => a.type)).toEqual(['navigate'])
  })

  it('stops when the user declines', async () => {
    const dispatcher = new FakeDispatcher()
    const { runtime } = buildRuntime(dispatcher, { confirm: async () => false })

    const outcome = await runtime.run({
      goal: 'download the report',
      context: context(),
      workflow: workflow(
        { id: 'dl', action: { type: 'download_file', params: { url: 'https://x.test/r.pdf' } } },
        { id: 'done', action: { type: 'finish' } }
      ),
    })

    expect(outcome.run.status).toBe('awaiting_confirmation')
    expect(outcome.run.error).toMatch(/declined/i)
    expect(dispatcher.dispatched).toHaveLength(0)
  })

  it('does not gate a non-mutating action even if it is listed', async () => {
    const dispatcher = new FakeDispatcher()
    const { runtime } = buildRuntime(dispatcher, { limits: { confirm: ['read_page'] } })

    const outcome = await runtime.run({
      goal: 'read',
      context: context(),
      workflow: workflow(step('a', 'read_page'), { id: 'done', action: { type: 'finish' } }),
    })

    expect(outcome.run.status).toBe('completed')
  })
})

describe('AgentRuntime — replanning', () => {
  it('regenerates the plan when the supervisor says the page changed', async () => {
    // Supervisor says replan; planner then returns a plan that works.
    const supervisor = new MockProvider({
      responder: (req) => {
        const isPlanner = req.messages[0].content.includes('planning engine')
        if (isPlanner) {
          return JSON.stringify({
            steps: [
              { id: 'r', action: { type: 'read_page' }, save_as: 'page' },
              { id: 'f', action: { type: 'finish', params: { result: 'page' } } },
            ],
            confidence: 0.8,
          })
        }
        return JSON.stringify({ verdict: 'replan', reason: 'The element is gone', feedback: 'No such button', confidence: 0.8 })
      },
    })

    const dispatcher = new FakeDispatcher({
      click: { success: false, error: 'missing', retryable: false },
    })

    const events: RuntimeEvent[] = []
    const runtime = new AgentRuntime({
      planner: new Planner({ provider: supervisor }),
      reasoner: new Reasoner({ provider: supervisor }),
      dispatcher,
      onEvent: (e) => {
        events.push(e)
      },
    })

    const outcome = await runtime.run({
      goal: 'press the vanished button',
      context: context(),
      workflow: workflow(step('click', 'click'), { id: 'done', action: { type: 'finish' } }),
    })

    expect(events.some((e) => e.type === 'replanning')).toBe(true)
    expect(outcome.run.status).toBe('completed')
  })

  it('gives up after exceeding the replan allowance', async () => {
    const supervisor = new MockProvider({
      responder: (req) => {
        const isPlanner = req.messages[0].content.includes('planning engine')
        if (isPlanner) {
          return JSON.stringify({
            steps: [{ id: 'c', action: { type: 'click' } }, { id: 'f', action: { type: 'finish' } }],
            confidence: 0.5,
          })
        }
        return JSON.stringify({ verdict: 'replan', reason: 'still wrong', feedback: 'nope', confidence: 0.5 })
      },
    })

    const dispatcher = new FakeDispatcher({ click: { success: false, error: 'missing', retryable: false } })

    const runtime = new AgentRuntime({
      planner: new Planner({ provider: supervisor }),
      reasoner: new Reasoner({ provider: supervisor }),
      dispatcher,
      maxReplans: 1,
    })

    const outcome = await runtime.run({
      goal: 'impossible',
      context: context(),
      workflow: workflow(step('click', 'click'), { id: 'done', action: { type: 'finish' } }),
    })

    expect(outcome.run.status).toBe('failed')
    expect(outcome.run.error).toMatch(/replanned/i)
  })
})

describe('AgentRuntime — accounting', () => {
  it('reports token usage and cost from planning and reasoning calls', async () => {
    const provider = new MockProvider({
      responses: [
        JSON.stringify({
          steps: [
            { id: 'r', action: { type: 'read_page' }, save_as: 'page' },
            { id: 'f', action: { type: 'finish', params: { result: 'page' } } },
          ],
          confidence: 0.9,
        }),
      ],
    })

    const runtime = new AgentRuntime({
      planner: new Planner({ provider }),
      reasoner: new Reasoner({ provider }),
      dispatcher: new FakeDispatcher(),
    })

    const outcome = await runtime.run({
      goal: 'find who the founders are and what they did before',
      context: context(),
    })

    expect(outcome.run.status).toBe('completed')
    expect(outcome.run.tokens_used).toBeGreaterThan(0)
    expect(outcome.run.cost_usd).toBeGreaterThan(0)
    expect(outcome.run.duration_ms).toBeGreaterThanOrEqual(0)
  })

  it('fails cleanly when the planner produces no steps', async () => {
    const provider = new MockProvider({ responses: [JSON.stringify({ steps: [], confidence: 0 })] })
    const runtime = new AgentRuntime({
      planner: new Planner({ provider }),
      reasoner: new Reasoner({ provider }),
      dispatcher: new FakeDispatcher(),
    })

    const outcome = await runtime.run({ goal: 'something impossible to plan', context: context() })

    expect(outcome.run.status).toBe('failed')
    expect(outcome.run.error).toMatch(/no executable steps/i)
  })
})
