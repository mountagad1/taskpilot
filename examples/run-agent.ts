/**
 * Start a run and follow it to completion.
 *
 *   TASKPILOT_API_KEY=tp_live_... AGENT_ID=... npx tsx examples/run-agent.ts
 *
 * Runs execute in the user's browser, so this script starts the run and then
 * polls. If nothing is executing the plan, it will time out — that is the
 * honest behaviour, not a bug.
 */

import { TaskPilot, TaskPilotError } from '@taskpilot/sdk'
import type { PageContext } from '@taskpilot/shared'

/** Stand-in for what the extension's content script captures from a live tab. */
const context: PageContext = {
  url: process.env.TARGET_URL ?? 'https://example.com/products',
  title: 'Products',
  visible_text: 'Widget A $19.99 · Widget B $24.50 · Widget C $9.00',
  detected_forms: [],
  detected_tables: [],
  page_type: 'ecommerce',
  domain: 'example.com',
}

async function main() {
  const taskpilot = new TaskPilot()

  // ── 1. Preview the plan without storing or executing anything ──
  const preview = await taskpilot.plan({
    goal: 'Extract every product name and price, then export as CSV',
    context,
    agentId: process.env.AGENT_ID,
  })

  console.log(`Planned ${preview.steps.length} steps (source: ${preview.source}, confidence ${preview.confidence})`)
  preview.steps.forEach((step, i) => {
    const target = step.action.target ? ` → ${step.action.target.by}="${step.action.target.value}"` : ''
    console.log(`  ${i + 1}. ${step.action.type}${target}`)
  })

  if (process.env.DRY_RUN === 'true') return

  // ── 2. Start it for real ──
  const started = await taskpilot.start({
    goal: 'Extract every product name and price, then export as CSV',
    agentId: process.env.AGENT_ID,
    context,
  })

  if (!started.run.id) {
    console.error('The run was not persisted.')
    return
  }

  console.log(`\nRun ${started.run.id} started.`)
  console.log(`Budgets: ${started.limits.max_steps} steps, ${started.limits.token_budget} tokens`)
  if (started.limits.confirm.length) {
    console.log(`Needs confirmation for: ${started.limits.confirm.join(', ')}`)
  }

  // ── 3. Follow it ──
  try {
    let lastCompleted = -1

    const finished = await taskpilot.watch(started.run.id, {
      pollIntervalMs: 1000,
      timeoutMs: 120_000,
      onUpdate: (run) => {
        // Only log when progress actually moves, so polling stays quiet.
        if (run.steps_completed === lastCompleted) return
        lastCompleted = run.steps_completed
        console.log(`  ${run.status}: ${run.steps_completed}/${run.steps_total}`)
      },
    })

    console.log(`\nFinished: ${finished.status} in ${finished.duration_ms}ms`)
    console.log(`Tokens: ${finished.tokens_used}, cost: $${finished.cost_usd}`)

    if (finished.error) console.error(`Error: ${finished.error}`)

    for (const step of finished.steps) {
      const mark = step.status === 'succeeded' ? 'ok  ' : step.status === 'failed' ? 'FAIL' : '--  '
      console.log(`  [${mark}] ${step.action}${step.error ? ` — ${step.error}` : ''}`)
    }

    console.log('\nOutput:', JSON.stringify(finished.output, null, 2).slice(0, 2000))
  } catch (err) {
    if (err instanceof TaskPilotError && err.code === 'watch_timeout') {
      console.error('\nThe run did not finish in time. Is the extension connected and on the target page?')
      return
    }
    throw err
  }
}

void main()
