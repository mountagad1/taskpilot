# 10 · Performance

The expensive things here are model calls and DOM round-trips. Most of the
design exists to avoid the first and minimise the second.

## Avoiding model calls

Three tiers, cheapest first (see
[06_EXECUTION_PIPELINE](06_EXECUTION_PIPELINE.md#planning)):

| Tier | Cost | Module |
|---|---|---|
| Heuristic planning | Free | `runtime/planner/heuristics.ts` |
| Semantic cache | One lookup | `runtime/cache/semantic-cache.ts` |
| Model call | Money + latency | `runtime/providers` |

A model call is the fallback, not the default.

## Token budgeting

`runtime/optimizer/token-optimizer.ts` assigns a budget per capability, so an
export step cannot consume the context an extraction step needs.

The extension also sends a **digest** of the page rather than its HTML —
candidate elements and roles only. This is the single largest lever on token
cost, and it doubles as a privacy property
([05_DATA_FLOW](05_DATA_FLOW.md#what-crosses-the-wire)).

## Caching

| Layer | Backing | Absent Redis |
|---|---|---|
| Semantic response cache | `response_cache` | Table still works |
| Rate limits | Upstash Redis | Per-process memory |

Redis is optional. Without it both fall back to in-process state — correct, but
not shared across instances. That is a scaling consideration, not a correctness
one.

## Quota accounting

`assertWithinPlanLimits` (`lib/runs.ts`) counts `agent_runs` since the start of
the calendar month (UTC) and compares against `PLAN_LIMITS`. It runs **before**
planning, so an over-limit request costs nothing.

Unlimited plans use `-1` and short-circuit before the count query.

## Frontend

- Route-level code splitting via the Next.js App Router
- `next/font` self-hosts fonts — no render-blocking third-party request
- Scroll reveals use `IntersectionObserver` and respect
  `prefers-reduced-motion`

## Cold start

`services/api` runs as a long-running container rather than serverless
functions, because it holds WebSocket connections and a worker loop. Cold start
is a deploy-time cost, not a per-request one.

The service starts without any credentials — missing ones disable features
instead of blocking boot, so a misconfiguration never manifests as a slow start.
