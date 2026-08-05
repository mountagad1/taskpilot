/**
 * Author, validate and publish an agent.
 *
 *   TASKPILOT_API_KEY=tp_live_... npx tsx examples/publish-agent.ts
 *
 * Re-running is safe: pass the printed agent id back as AGENT_ID and the
 * script publishes a new version of the same listing instead of creating a
 * duplicate.
 */

import { TaskPilot, defineAgent, AgentDefinitionError, TaskPilotError } from '@taskpilot/sdk'

const agent = defineAgent({
  name: 'Competitor Price Monitor',
  goal: 'Extract every product name and price on the page and export them to a spreadsheet',
  category: 'ecommerce',
  version: process.env.AGENT_VERSION ?? '1.0.0',
})
  .describe(
    'Built for repeat runs against the same storefront URLs. Extracts product ' +
      'names and prices into a typed sheet you can diff over time.'
  )
  .input({
    name: 'format',
    label: 'Export format',
    type: 'select',
    required: false,
    default: 'excel',
    options: ['csv', 'excel', 'json'],
    description: 'How to package the extracted rows.',
  })
  .harness({
    model: 'gpt-4.1-mini',
    max_steps: 10,
    token_budget_per_run: 3000,
    timeout_ms: 60_000,
  })
  .trigger({ type: 'url_match', pattern: 'https://*/products/*', surface: 'sidebar' })
  .workflow((s) => {
    s.readPage('page')
      // Scroll first: most storefronts lazy-load the rest of the grid.
      .scroll('bottom')
      .wait(800)
      .extractStructured(['product_name', 'price', 'currency', 'availability'], 'products')
      .export('products', 'excel', {
        filename: 'competitor-prices',
        condition: { key: 'products', op: 'exists' },
      })
      .finish('export')
  })

async function main() {
  // Validate before touching the network: a bad manifest is an authoring bug,
  // not a server round trip.
  let manifest
  try {
    manifest = agent.build()
  } catch (err) {
    if (err instanceof AgentDefinitionError) {
      console.error('This agent is not valid:')
      for (const issue of err.issues) console.error(`  ${issue.path}: ${issue.message}`)
      process.exit(1)
    }
    throw err
  }

  console.log(`Manifest OK — ${manifest.capabilities.length} capabilities, ${manifest.workflow?.length} steps`)
  console.log(`  ${manifest.capabilities.join(', ')}`)

  const taskpilot = new TaskPilot()

  try {
    const { agent: record, version } = await taskpilot.publish(agent, {
      agentId: process.env.AGENT_ID,
      changelog: process.env.CHANGELOG ?? 'Initial release',
      list: process.env.LIST === 'true',
      priceCents: Number(process.env.PRICE_CENTS ?? 0),
    })

    console.log(`\nPublished ${record.name} v${version}`)
    console.log(`  id:     ${record.id}`)
    console.log(`  status: ${record.status} (${record.visibility})`)
    console.log(`\nPublish the next version with AGENT_ID=${record.id}`)
  } catch (err) {
    if (err instanceof TaskPilotError) {
      console.error(`\nPublish failed [${err.code}]: ${err.message}`)
      err.issues?.forEach((i) => console.error(`  ${i.path}: ${i.message}`))
      process.exit(1)
    }
    throw err
  }
}

void main()
