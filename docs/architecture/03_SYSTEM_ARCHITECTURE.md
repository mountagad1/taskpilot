# 03 · System Architecture

## Layers

Each layer depends only on the one beneath it. The browser automation layer
holds no credentials; the application layer holds no DOM knowledge.

```text
┌──────────────────────────────────────────────────────────────┐
│  Presentation                                                │
│  Web app · Browser extension · Dashboard                     │
│  apps/web · apps/extension                                   │
└──────────────────────────────────────────────────────────────┘
                              │
┌──────────────────────────────────────────────────────────────┐
│  Application                                                 │
│  Auth · Marketplace · Billing · Teams · Analytics · Keys     │
│  services/api/src/routes                                     │
└──────────────────────────────────────────────────────────────┘
                              │
┌──────────────────────────────────────────────────────────────┐
│  AI Runtime                                                  │
│  Planning · Memory · Reasoning · Orchestration · Providers   │
│  services/api/src/runtime                                    │
└──────────────────────────────────────────────────────────────┘
                              │
┌──────────────────────────────────────────────────────────────┐
│  Browser Automation                                          │
│  DOM · Actions · Extraction · Export · Smart Paste           │
│  packages/browser-tools                                      │
└──────────────────────────────────────────────────────────────┘
```

## Service map

One Hono application (`services/api/src/app.ts`) serves everything under `/v1`.
Separate concerns, one deployment — which keeps local development and the
request path simple.

Route modules are **grouped, not one-file-per-route**. This is the least obvious
thing about navigating `services/api`, so it is recorded explicitly:
`platform.ts` holds the collaboration and distribution surfaces, `misc.ts` the
operational ones.

| Capability | Route | Handler | Domain logic |
|---|---|---|---|
| Authentication | `/v1/auth` | `routes/auth.ts` | — |
| Agent registry | `/v1/agents` | `routes/agents.ts` | `lib/agents.ts` |
| Runs (execution) | `/v1/runs` | `routes/runs.ts` | `lib/runs.ts` |
| Workflow engine | `/v1/workflows` | `routes/platform.ts` | `lib/workflows.ts`, `lib/cron.ts` |
| Marketplace | `/v1/marketplace` | `routes/platform.ts` | `lib/marketplace.ts` |
| Notifications | `/v1/notifications` | `routes/platform.ts` | `notify_user` RPC, `lib/rows.ts` |
| Teams | `/v1/teams` | `routes/platform.ts` | row-level security in `db/` |
| API keys | `/v1/keys` | `routes/platform.ts` | `lib/keys.ts` |
| Billing | `/v1/billing` | `routes/misc.ts` | `lib/billing.ts` |
| Exports | `/v1/exports` | `routes/misc.ts` | `packages/browser-tools/src/export` |
| Analytics | `/v1/analytics` | `routes/misc.ts` | — |
| Queue workers | `/v1/jobs/worker` | `routes/misc.ts` | `lib/worker.ts`, `worker-loop.mjs` |
| AI entry point | `/v1/ai` | `routes/misc.ts` | `runtime/` |
| Integrations (OAuth) | `/v1/integrations` | `routes/integrations.ts` | `lib/oauth`, `lib/crypto.ts` |

`GET /v1` returns a discovery document describing this surface at runtime.

## Runtime internals

| Concern | Module |
|---|---|
| Planning | `runtime/planner` — heuristics first, model second |
| Reasoning | `runtime/reasoner` |
| Memory | `runtime/memory` |
| Token budgeting | `runtime/optimizer/token-optimizer.ts` |
| Semantic cache | `runtime/cache/semantic-cache.ts` |
| Providers | `runtime/providers` — Anthropic, OpenAI, mock |

Providers are interchangeable behind `runtime/providers/types.ts`.

## Shared packages

| Package | Responsibility |
|---|---|
| `packages/shared` | Domain types, manifest validation, capability catalogue |
| `packages/browser-tools` | Element resolver, action executor, extraction, exports |
| `packages/api-client` | Typed REST transport |
| `packages/sdk` | Author, publish and run agents |

`@taskpilot/shared` is the only package both sides of the trust boundary
import — it carries vocabulary, never behaviour that needs a secret.
