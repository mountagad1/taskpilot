# TaskPilot — The AI Agent for Your Browser

Turn natural language into real browser actions. Fill forms, extract structured
data, navigate sites, generate replies, move files and export results — then
package any of it as a reusable AI agent and publish it to a marketplace.

---

## What's in here

TaskPilot follows a **public frontend / private backend** split.

**Public** — nothing secret lives here:

| Package | What it is |
|---|---|
| `apps/web` | Next.js 14 marketing site and dashboard |
| `apps/extension` | Chrome/Edge/Brave/Arc extension (Manifest V3) |
| `packages/shared` | Domain types, manifest validation, capability catalogue |
| `packages/browser-tools` | Element resolver, action executor, extraction, exports |
| `packages/api-client` | Typed REST transport |
| `packages/sdk` | Developer SDK — author, publish and run agents |
| `examples/` | Runnable SDK scripts |

**Private** — the only thing holding credentials:

| Package | What it is |
|---|---|
| `services/api` | AI runtime, agent registry, marketplace, authentication, billing, queue workers, database |

The boundary is real: `services/api` imports nothing from `apps/`, and shares
only `@taskpilot/shared`. [RUNNING.md](RUNNING.md#splitting-into-two-repositories)
has the two-command extraction into separate repositories.

---

## How it fits together

```
  Natural language  ─────────────────────────────────────────────┐
                                                                 │
  ┌─────────────────── AI RUNTIME (server) ───────────────────┐   │
  │  Planner    heuristics first, LLM only when needed        │◄──┘
  │  Reasoner   rules first, LLM only for ambiguity           │
  │  Memory     per-run scratchpad + namespaced long-term     │
  │  Run loop   budgets for steps, tokens and wall clock      │
  └───────────────────────────┬───────────────────────────────┘
                              │  ActionPlan (JSON, validated)
                              ▼
  ┌──────────── BROWSER AUTOMATION (extension) ───────────────┐
  │  Executor   resolves elements, drives the DOM             │
  │  Host       tabs, downloads, screenshots, clipboard       │
  └───────────────────────────┬───────────────────────────────┘
                              │  per-step results
                              ▼
                     Run history · analytics · cost
```

**The server plans; the browser executes.** The backend never holds the user's
session cookies — it issues a plan, and the extension carries it out inside the
page the user is already authenticated on. Every step's outcome is reported
back, which is what makes runs debuggable rather than a black box.

### Cost model

The planner tries a set of heuristic rules before it reaches for a model.
"Summarise this page", "get every email", "export the table to CSV" and roughly
a dozen other shapes resolve to a plan with **zero tokens spent**. The reasoner
works the same way: a succeeded step, a retryable failure, an optional step that
failed — all decided by rules. Only genuine ambiguity costs a model call.

---

## Quick start

```bash
pnpm install

pnpm dev:api    # private backend  → http://localhost:4000
pnpm dev:web    # public frontend  → http://localhost:3000
```

Both start **without any credentials**. Missing services disable the features
that need them and return `503 not_configured` — nothing crashes, and
`GET /health` reports what is live.

| Missing | Behaviour |
|---|---|
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Heuristic planning still works; anything needing a model says so |
| `UPSTASH_REDIS_*` | Rate limiting and caching fall back to per-process memory |
| `STRIPE_*` | Billing endpoints report `not_configured` |
| Supabase keys | Pages render; data endpoints report `not_configured` |

**[RUNNING.md](RUNNING.md) is the full guide** — credentials, the database,
loading the extension, testing, deploying, and troubleshooting.

---

## Commands

```bash
pnpm dev:api        # backend in watch mode
pnpm dev:web        # frontend in watch mode
pnpm build          # production build of everything
pnpm test           # 289 tests across 14 files
pnpm type-check     # all 8 packages
pnpm worker         # background job ticker
```

Target one suite:

```bash
pnpm test --project api
pnpm test --project db
pnpm test --project browser-tools
```

---

## Security model

Third-party agents run with the user's browser session, so the trust boundary
is taken seriously and enforced in more than one place.

**Manifests are untrusted input.** `parseAgentManifest` is the only way a
manifest reaches the runtime. It rejects unknown capabilities rather than
dropping them, clamps budgets to platform ceilings, drops unknown top-level
keys, and refuses a workflow step that calls something the listing never
declared.

**URLs are checked three times** — at manifest validation, at plan validation,
and again in the executor immediately before navigating. `javascript:`, `data:`
and `file:` are rejected at every layer.

**Capabilities are intersected, never unioned.** A run may use only what the
agent declared *and* what the caller's plan permits. Even a workflow baked into
a published manifest is re-checked on every run.

**Destructive actions need confirmation.** `navigate`, `download_file`,
`upload_file` and `push_integration` pause the run by default. With no
confirmation handler attached the run reports `awaiting_confirmation` rather
than proceeding.

**`close_tab` can only close tabs the run itself opened.**

**RLS on every user-facing table**, tested by impersonating a real
non-superuser role — because a superuser bypasses RLS unconditionally, so
testing as one proves nothing.

**The frontend holds no secrets.** No database credentials, no auth SDK, no
model keys. It signs in through the API and keeps only a token pair.

**API keys are stored as SHA-256 digests.** The plaintext is returned exactly
once. A key can never mint or list other keys — that path is session-only, so a
leaked credential cannot renew itself.

**CSV injection is neutralised** on export: cells starting `=`, `+`, `-` or `@`
are prefixed so a scraped page cannot execute a formula in someone's
spreadsheet.

---

## Developer platform

```bash
npm install @taskpilot/sdk
```

```ts
import { TaskPilot, defineAgent } from '@taskpilot/sdk'

const agent = defineAgent({
  name: 'Email Harvester',
  goal: 'Collect every email address on the page and export it as CSV',
})
  .workflow((s) => {
    s.readPage('page').extractEmails('emails').export('emails', 'csv').finish('export')
  })

await new TaskPilot().publish(agent, { list: true })
```

- SDK reference: [`packages/sdk/README.md`](packages/sdk/README.md)
- REST reference: [`docs/API.md`](docs/API.md)
- Discovery document: `GET /v1`
- Runnable scripts: [`examples/`](examples)

---

## Background worker

Scheduled workflows, usage rollups and file sweeps run through a Postgres job
queue claimed with `FOR UPDATE SKIP LOCKED`, so several workers can poll
concurrently without collisions. Failures retry with exponential backoff, then
park as `dead`. Jobs abandoned by a crashed worker are requeued after 15 minutes.

```bash
curl -X POST https://api.taskpilot.cc/v1/jobs/worker -H "X-Worker-Secret: $WORKER_SECRET"
```

Point any scheduler at it. Set `WORKER_SECRET` to enable the endpoint — without
it the route refuses to run rather than defaulting open.

---

## Testing

| Suite | Covers |
|---|---|
| `shared` | Manifest validation, the trust boundary |
| `api` | Planning, reasoning verdicts, memory interpolation, the run loop under budgets/retries/replanning/confirmation, cron, API keys, and the real Hono app driven through `app.request()` |
| `browser-tools` | The executor against a real DOM: targeting, framework-visible input, extraction, URL scheme enforcement, export serialisation |
| `sdk` | Agent authoring, capability derivation, selector inference |
| `web` | The auth client: token refresh, concurrent-refresh collapsing, corrupt storage |
| `db` | Every migration executed on real PostgreSQL: constraints, triggers, the job queue, and RLS enforced as a non-superuser |

The LLM is never called in tests. A scripted provider makes planner and runtime
behaviour deterministic, which is also what the app falls back to when no API
key is configured.

---

## License

Proprietary — TaskPilot © 2026. All rights reserved.
