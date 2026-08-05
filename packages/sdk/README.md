# @taskpilot/sdk

Build, publish and run TaskPilot browser agents from TypeScript.

```bash
npm install @taskpilot/sdk
```

---

## Quick start

```ts
import { TaskPilot, defineAgent } from '@taskpilot/sdk'

const taskpilot = new TaskPilot({ apiKey: process.env.TASKPILOT_API_KEY })

const agent = defineAgent({
  name: 'Email Harvester',
  goal: 'Collect every email address on the page and export it as a CSV',
  category: 'extraction',
})
  .describe('Scans the visible page for email addresses, dedupes them, and hands back a CSV.')
  .workflow((s) => {
    s.readPage('page')
      .extractEmails('emails')
      .export('emails', 'csv', { filename: 'contacts' })
      .finish('export')
  })

await taskpilot.publish(agent, { list: true, priceCents: 0 })
```

`defineAgent(...).build()` runs the same validator the server does, so a
manifest that builds locally is one the registry will accept.

---

## Authentication

Create a key at **Dashboard → Developers**. Keys are shown once.

```ts
new TaskPilot({ apiKey: 'tp_live_...' })          // explicit
new TaskPilot()                                    // reads TASKPILOT_API_KEY
new TaskPilot({ baseUrl: 'http://localhost:3000' }) // point at a local server
```

In a browser where the user is already signed in, omit the key — the client
sends session cookies instead.

### Scopes

A key carries only the scopes you grant it. Requesting an endpoint outside
them returns `403 forbidden` naming the missing scope.

| Scope | Grants |
|---|---|
| `agents:read` | List and read agents |
| `agents:write` | Create, update, install |
| `agents:publish` | Publish new versions |
| `runs:read` | Read run history and timelines |
| `runs:write` | Start runs, report steps, complete them |
| `workflows:read` / `workflows:write` | Manage saved workflows |
| `marketplace:read` | Browse the public catalogue |
| `exports:write` | Generate exports |

---

## Authoring agents

### The step builder

Every method returns the builder, so a workflow reads as a sequence:

```ts
defineAgent({ name: 'Lead Capture', goal: 'Capture the contact and push it to the CRM' })
  .category('sales')
  .workflow((s) => {
    s.readPage('page')
      .extractStructured(['name', 'email', 'company', 'job_title'], 'contact')
      .pushTo('hubspot', 'contact')
      .notify('Contact captured')
      .finish('contact')
  })
  .build()
```

Capabilities are **derived from the workflow** — you cannot forget to declare
one. Add extras the planner may need with `.can('screenshot')`.

### Targeting elements

A bare string is inferred: selector-shaped strings become CSS, phrases become
visible-text matches.

```ts
s.click('#save')            // → { by: 'css',  value: '#save' }
s.click('Save changes')     // → { by: 'text', value: 'Save changes' }
s.click({ by: 'label', value: 'Email address' })  // explicit
```

Prefer `label`, `role` or `testid` over CSS — pages change, and the resolver
falls through `fallbacks` when the primary strategy misses:

```ts
s.click({
  by: 'testid',
  value: 'submit-btn',
  fallbacks: [{ by: 'role', value: 'button' }, { by: 'text', value: 'Submit' }],
})
```

### Passing data between steps

`save_as` names a step's output; `{{name}}` reads it back. A string that is
*only* a reference resolves to the raw value, not its JSON text.

```ts
s.extractTable('rows')
 .export('rows', 'excel')   // becomes params.rows = '{{rows}}'
```

### Conditions, retries and optional steps

```ts
s.extractEmails('emails')
 .export('emails', 'csv', { condition: { key: 'emails', op: 'exists' } })
 .click('#flaky', { retry: { max_attempts: 3, backoff_ms: 500 } })
 .raw({ type: 'screenshot' }, { optional: true })
```

### Budgets

```ts
.harness({
  model: 'gpt-4.1-mini',
  max_steps: 12,
  token_budget_per_run: 4000,
  timeout_ms: 60_000,
  require_confirmation: ['navigate', 'download_file'],
})
```

The runtime aborts the run when any budget is exhausted. Platform ceilings
still apply — a manifest cannot buy itself a bigger budget than the caller's
plan allows.

---

## Running agents

Runs are **planned on the server and executed in the user's browser**, so the
backend never holds their session cookies. `start()` returns the plan; the
extension carries it out and reports back.

```ts
const { run, plan } = await taskpilot.start({
  agentId: 'agent-uuid',
  context: { url: 'https://example.com', title: 'Example', visible_text: '...' },
})

console.log(plan.steps.map((s) => s.action.type))

const finished = await taskpilot.watch(run.id!, {
  onUpdate: (r) => console.log(r.status, `${r.steps_completed}/${r.steps_total}`),
})

console.log(finished.output.result)
```

`run()` combines the two when you just want the result.

### Previewing without executing

```ts
const plan = await taskpilot.plan({
  goal: 'Extract every product price and export to Excel',
  context: pageContext,
})
```

Nothing is stored and nothing touches the page.

---

## Error handling

Every failure is a `TaskPilotError` carrying the server's envelope:

```ts
import { TaskPilotError } from '@taskpilot/sdk'

try {
  await taskpilot.publish(agent)
} catch (err) {
  if (err instanceof TaskPilotError) {
    console.error(err.code, err.message)
    err.issues?.forEach((i) => console.error(`  ${i.path}: ${i.message}`))
    if (err.retryable) { /* 429 or 5xx — the client already retried */ }
  }
}
```

| Code | Meaning |
|---|---|
| `validation_failed` | The body was malformed; `issues` names each field |
| `plan_limit` | The account's plan does not allow this |
| `payment_required` | A paid agent must be purchased first |
| `conflict` | Version not newer, duplicate invite, already installed |
| `rate_limited` | Slow down; `retryAfter` says how long |

Retries for `429` and `5xx` are automatic with backoff, honouring `Retry-After`.

---

## Reference

| Namespace | Methods |
|---|---|
| `taskpilot.agents()` | `list` `get` `create` `update` `remove` `publish` `versions` `install` `uninstall` `manifest` `reviews` `review` |
| `taskpilot.runs()` | `list` `get` `create` `reportStep` `complete` `cancel` |
| `taskpilot.workflows()` | `list` `get` `create` `update` `remove` |
| `taskpilot.marketplace()` | `browse` `checkout` |
| `taskpilot.teams()` | `list` `create` `members` `invite` `acceptInvite` `removeMember` |
| `taskpilot.keys()` | `list` `create` `revoke` |
| `taskpilot.notifications()` | `list` `markRead` |

Need the raw HTTP layer? `taskpilot.api.http` is a `HttpClient` you can call
directly, and `@taskpilot/api-client` is usable on its own.

---

## Examples

See [`examples/`](../../examples) for runnable scripts:

- `publish-agent.ts` — author, validate and publish
- `run-agent.ts` — start a run and stream its progress
- `bulk-extract.ts` — fan an extraction agent across many URLs
