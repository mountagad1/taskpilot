# TaskPilot — Architecture

> **The AI Agent for Your Browser.**
>
> TaskPilot turns natural language into real browser actions: filling forms,
> extracting structured data, navigating sites, generating replies, moving files
> and exporting results — then packaging any of it as a reusable AI agent that
> can be shared with a team or sold on a marketplace.

This document is the map between the architecture and the code that implements
it. Every component below names the module that provides it, so the diagram and
the repository cannot drift apart silently.

For running the stack locally see [RUNNING.md](../RUNNING.md). For the REST
surface see [API.md](API.md).

---

## The five products

| Product | What it does | Where it lives |
|---|---|---|
| **Browser Extension** | Executes agents inside the page | `apps/extension` |
| **Web Application** | Users, agents, billing, analytics, history | `apps/web` |
| **AI Runtime** | Plans, reasons and drives execution | `services/api/src/runtime` |
| **Marketplace** | Publish, discover, buy and sell agents | `services/api/src/lib/marketplace.ts` |
| **Developer Platform** | SDK, typed client and API keys | `packages/sdk`, `packages/api-client` |

---

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

---

## Service map

Everything is served by one Hono application (`services/api/src/app.ts`) under
the `/v1` prefix. They are separate concerns, not separate deployments — a
single process keeps local development and the request path simple.

Route modules are grouped rather than one-file-per-route: `platform.ts` holds
the collaboration and distribution surfaces, `misc.ts` the operational ones.

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

### AI runtime internals

| Concern | Module |
|---|---|
| Planning | `runtime/planner` (heuristics first, model second) |
| Reasoning | `runtime/reasoner` |
| Memory | `runtime/memory` |
| Token budgeting | `runtime/optimizer/token-optimizer.ts` |
| Semantic cache | `runtime/cache/semantic-cache.ts` |
| Model providers | `runtime/providers` (Anthropic, OpenAI, mock) |

Providers are interchangeable behind `runtime/providers/types.ts`. With no key
configured the mock provider keeps the rest of the system testable, and
heuristic planning still resolves common tasks.

---

## Data flow

```text
  Natural language
        │
        ▼
  Extension captures page context (DOM digest, not raw HTML)
        │
        ▼  HTTPS
  API authenticates, checks plan limits, records a run
        │
        ▼
  Runtime plans steps — heuristics, then a model when needed
        │
        ▼  step list
  Extension executes against the live DOM
        │
        ▼
  Results stored, exported, or returned to the caller
```

Two properties matter here. Planning happens server-side, so prompts and
credentials never reach the page; execution happens client-side, so the user's
existing sessions and cookies are reused rather than replayed on a server.

---

## Repository strategy

TaskPilot is a **public frontend / private backend** split. `services/api` is
the only package that holds credentials; it imports nothing from `apps/` and
shares only `@taskpilot/shared`. That boundary is what makes the split possible
without a rewrite — see
[RUNNING.md](../RUNNING.md#splitting-into-two-repositories).

| Public | Private |
|---|---|
| `apps/web`, `apps/extension` | `services/api` |
| `packages/shared`, `browser-tools` | AI runtime, marketplace backend |
| `packages/sdk`, `api-client` | Auth, billing, database, workers |
| `docs/`, `examples/` | Infrastructure, deployment |

---

## Deployment

| Component | Host | Notes |
|---|---|---|
| `apps/web` | Vercel | `NEXT_PUBLIC_*` is inlined at build time — an env change needs a redeploy |
| `services/api` | Railway | Long-running process; container built from `services/api/Dockerfile` |
| Database | Supabase (PostgreSQL) | Row-level security; migrations in `services/api/db` |
| Cache / rate limits | Upstash Redis | Optional — falls back to per-process memory |

The API degrades rather than fails: a missing credential disables the feature
that needs it and returns `503 not_configured`, while `GET /health` reports
which subsystems are live.

---

## Long-term direction

TaskPilot aims to be the operating system for browser automation: every browser
task executable through natural language, every workflow packageable as an
agent, and every agent shareable with a team or distributed through the
marketplace — so developers can build businesses on their agents and users can
automate work without writing code.
