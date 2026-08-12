# Domain · Memory

What the runtime remembers within and across runs, so a multi-step task keeps
its thread without resending everything on every call.

**Owns** `services/api/src/runtime/memory/`

## Why it exists

A plan is not one model call. Later steps need to know what earlier steps found
— the row that was extracted, the tab that was opened, the value that was
filled. Memory carries that forward.

The alternative, replaying the whole transcript each step, costs tokens that
grow with run length.

## Relationship to the cache

Distinct concerns, easy to confuse:

| | Memory | Semantic cache |
|---|---|---|
| Scope | Within a run | Across runs and users |
| Answers | "What happened so far?" | "Have we planned this before?" |
| Module | `runtime/memory/` | `runtime/cache/semantic-cache.ts` |

## Persistence

Step-level history is durable in `agent_run_steps`, which is what makes a run
auditable and replayable after the fact.

## Tests

`runtime/memory/memory.test.ts` — 17 cases.

## See also

[ai](../ai/) · [10_PERFORMANCE](../../architecture/10_PERFORMANCE.md#token-budgeting)
