# Domain · Analytics

What happened, and whether it was worth it.

**Owns** `/v1/analytics` (`services/api/src/routes/misc.ts`)

## Data

| Table | Holds |
|---|---|
| `analytics_events` | Discrete events |
| `productivity_metrics` | Derived outcome measures |
| `usage_periods` | Quota accounting windows |
| `api_key_usage` | Programmatic call volume |

## Two different questions

**Usage** — how much of the plan has been consumed. Authoritative for billing,
counted from `agent_runs` by `lib/runs.ts`
([billing](../billing/)).

**Productivity** — whether automation actually saved effort. Reporting only;
nothing enforces from it.

Keeping these apart matters: a metric that is merely *interesting* must never
become the number a quota is enforced from.

## Write path

Analytics are written on the normal request path but nothing in the execution
pipeline blocks on them. A failure to record a metric must not fail a user's
run.

## Surfaces

The dashboard in `apps/web` reads this domain; the extension emits events into
it.

## See also

[07_EVENT_ARCHITECTURE](../../architecture/07_EVENT_ARCHITECTURE.md#analytics-events)
