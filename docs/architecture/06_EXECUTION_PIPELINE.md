# 06 · Execution Pipeline

The path a single run takes, and the module responsible at each stage.

```text
  request ─► authorize ─► admit ─► plan ─► execute ─► record
```

| Stage | Does | Module |
|---|---|---|
| **Authorize** | Identify caller — session or API key | `lib/keys.ts`, `routes/auth.ts` |
| **Admit** | Check plan limits before spending anything | `lib/runs.ts` · `assertWithinPlanLimits` |
| **Plan** | Produce ordered steps | `runtime/planner` |
| **Execute** | Perform steps against the DOM | `packages/browser-tools` |
| **Record** | Persist run, steps, usage | `lib/runs.ts` |

Admission happens **before** planning. Quota is checked ahead of any model call
so an over-limit user costs nothing.

## Planning

The planner tries in order:

1. **Heuristics** — deterministic resolution for recognisable tasks
   (`runtime/planner/heuristics.ts`). Free, fast, testable.
2. **Semantic cache** — a previously computed plan for an equivalent request
   (`runtime/cache/semantic-cache.ts`).
3. **Model** — a provider call, budgeted by
   `runtime/optimizer/token-optimizer.ts`.

Each tier only runs if the one before it did not resolve the task. With no
provider configured, tier 3 falls back to the mock provider and tiers 1–2 still
work.

## Execution

Steps run in the extension. For each step the browser layer resolves a target
element, performs the action, and reports the outcome:

| Concern | Module |
|---|---|
| Finding the element | `browser-tools/src/dom` |
| Performing the action | `browser-tools/src/actions` |
| Reading data out | `browser-tools/src/extract` |
| Writing files out | `browser-tools/src/export` |
| Form autofill | `browser-tools/src/smart-paste.ts` |

A step that cannot resolve its target fails that step and records the reason;
it does not abort the whole run silently.

## Recording

Every run writes an `agent_runs` row and one `agent_run_steps` row per step.
This is what makes runs replayable, auditable, and countable for billing — the
same table is the quota unit described in
[04_DOMAIN_MODEL](04_DOMAIN_MODEL.md#execution).

## Deferred execution

Scheduled and background work takes the same pipeline, entered from the queue
instead of a request — see [07_EVENT_ARCHITECTURE](07_EVENT_ARCHITECTURE.md).
