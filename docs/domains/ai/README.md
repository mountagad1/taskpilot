# Domain · AI

Turns an instruction plus page context into an ordered list of steps.

**Owns** `services/api/src/runtime/`

| Concern | Module |
|---|---|
| Planning | `planner/` — `heuristics.ts`, `index.ts` |
| Reasoning | `reasoner/` |
| Memory | `memory/` — see [memory](../memory/) |
| Token budgeting | `optimizer/token-optimizer.ts` |
| Semantic cache | `cache/semantic-cache.ts` |
| Providers | `providers/` — `anthropic.ts`, `openai.ts`, `mock.ts` |
| Orchestration | `agent-runtime.ts` |

## Planning order

1. Heuristics — deterministic, free, testable
2. Semantic cache — reuse an equivalent plan
3. Model — budgeted provider call

Each tier runs only if the previous did not resolve the task.

## Providers

Interchangeable behind `providers/types.ts`. With no key configured the mock
provider keeps the system testable and heuristic planning still resolves common
tasks — `GET /health` reports `"ai": "unconfigured"` rather than failing.

## Entry points

| Surface | Route |
|---|---|
| Direct AI calls | `/v1/ai` (`routes/misc.ts`) |
| Agent runs | `/v1/runs` (`routes/runs.ts`) |

## Data

`ai_requests` records model calls; `response_cache` holds cache entries;
`saved_prompts` holds reusable user prompts.

## Tests

`runtime/agent-runtime.test.ts`, `runtime/planner/planner.test.ts`,
`runtime/memory/memory.test.ts`.

## See also

[06_EXECUTION_PIPELINE](../../architecture/06_EXECUTION_PIPELINE.md) ·
[10_PERFORMANCE](../../architecture/10_PERFORMANCE.md)
