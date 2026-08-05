# Running and testing TaskPilot

Three pieces, each runnable on its own:

| Piece | Where | Port | Needs |
|---|---|---|---|
| **API service** (private backend) | `services/api` | 4000 | nothing to start |
| **Web app** (public frontend) | `apps/web` | 3000 | the API service |
| **Extension** | `apps/extension` | — | Chrome, and the API service |

Everything starts and runs **without any credentials**. Missing services
disable the features that need them and return `503 not_configured` — nothing
crashes, and `GET /health` tells you what is live.

---

## 1. Install

```bash
pnpm install
```

Requires Node ≥ 20 and pnpm ≥ 9 (`npm i -g pnpm`).

---

## 2. Run everything

Two terminals:

```bash
# terminal 1 — the private backend
pnpm dev:api          # http://localhost:4000

# terminal 2 — the public frontend
pnpm dev:web          # http://localhost:3000
```

Check the backend came up:

```bash
curl http://localhost:4000/health
```

```jsonc
{
  "status": "ok",
  "service": "taskpilot-api",
  "database": "unconfigured",   // what is and isn't wired up
  "ai": "unconfigured"
}
```

Then open **http://localhost:3000**. The marketing site, marketplace and
dashboard all render. Anything that needs the database says so plainly.

### With credentials

To exercise sign-up, agents, runs and the marketplace for real you need a
Supabase project.

```bash
cp services/api/.env.example services/api/.env
cp apps/web/.env.example apps/web/.env.local
```

Fill in `services/api/.env`:

```bash
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
OPENAI_API_KEY=sk-...          # optional — heuristic planning works without it
```

`apps/web/.env.local` needs only:

```bash
NEXT_PUBLIC_API_URL=http://localhost:4000
```

Note the web app holds **no secrets and no database credentials**. That is the
point of the split — see [Architecture](#architecture) below.

### Apply the database schema

```bash
cd services/api/db
supabase start        # local Postgres + Auth + Studio
supabase db push      # applies migrations/ in order
```

Or paste `services/api/db/migrations/*.sql` into the Supabase SQL editor, in
filename order.

---

## 3. Build and load the extension

```bash
# Production build — points at https://api.taskpilot.cc
pnpm --filter @taskpilot/extension build

# Local build — points at your dev servers
cd apps/extension
TASKPILOT_API_ORIGIN=http://localhost:4000 \
TASKPILOT_WEB_ORIGIN=http://localhost:3000 \
node scripts/build.mjs --dev
```

Then:

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. **Load unpacked** → select `apps/extension/dist`

The API origin is **baked in at build time**, not read from storage — a
compromised page cannot repoint the extension at another server. The build
prints which origins it used.

### Using it

| Action | How |
|---|---|
| Command palette | `Alt+K` on any page |
| Popup | `Alt+T`, or click the toolbar icon |
| Smart Paste | `Alt+V` |
| Sidebar | `Alt+S` |
| Right-click menu | Select text → **TaskPilot AI** |

Sign in at `http://localhost:3000/auth/login`. The web app hands the extension
your access token automatically — set `NEXT_PUBLIC_EXTENSION_ID` in
`apps/web/.env.local` to the ID shown on `chrome://extensions` for this to work.

### Package for the Chrome Web Store

```bash
pnpm --filter @taskpilot/extension package
# → apps/extension/taskpilot-extension-v1.1.0.zip
```

Pure Node — no `zip` binary needed, so it works the same on Windows and CI.

---

## 4. Testing

```bash
pnpm test          # 289 tests across 14 files
pnpm type-check    # all 8 packages
pnpm build         # production build of everything
```

Target one suite:

```bash
pnpm test --project api             # runtime, kernel, routes
pnpm test --project db              # migrations on real Postgres
pnpm test --project browser-tools   # DOM executor
pnpm test --project shared          # manifest validation
pnpm test --project sdk
pnpm test --project web
```

| Suite | What it covers |
|---|---|
| `shared` | Manifest validation — the trust boundary for third-party agents |
| `api` | Planner, reasoner, memory, the run loop under budgets/retries/replanning, cron, API keys, and the real Hono app driven through `app.request()` |
| `browser-tools` | The executor against a real DOM: targeting, framework-visible input, extraction, URL-scheme enforcement, CSV injection |
| `db` | Every migration executed on real PostgreSQL (PGlite/WASM) — constraints, triggers, the job queue, and RLS enforced as a non-superuser |
| `sdk` | Agent authoring, capability derivation, selector inference |
| `web` | The auth client: token refresh, concurrent-refresh collapsing, corrupt storage |

No test calls a model or a network service. A scripted LLM provider makes
planner and runtime behaviour deterministic — and is also what the app falls
back to when no API key is configured.

### Checking it by hand

```bash
# Public — no credentials needed
curl http://localhost:4000/health
curl http://localhost:4000/v1                    # discovery document
curl http://localhost:4000/v1/marketplace/agents

# Authenticated — returns 401 without a token
curl http://localhost:4000/v1/me

# Sign in, then use the token
TOKEN=$(curl -s -X POST http://localhost:4000/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"..."}' | jq -r .data.access_token)

curl http://localhost:4000/v1/me -H "Authorization: Bearer $TOKEN"
curl http://localhost:4000/v1/agents -H "Authorization: Bearer $TOKEN"
```

---

## 5. Background worker

Scheduled workflows, usage rollups and file sweeps run through a Postgres job
queue.

```bash
# Poll locally
WORKER_SECRET=$(openssl rand -hex 32) pnpm worker

# Or drive it from any scheduler
curl -X POST http://localhost:4000/v1/jobs/worker -H "X-Worker-Secret: $WORKER_SECRET"
```

The endpoint refuses to run until `WORKER_SECRET` is set — it fails closed
rather than defaulting open.

---

## Architecture

```
  ┌──────────────────┐        ┌──────────────────┐
  │  apps/web        │        │  apps/extension  │
  │  marketing +     │        │  MV3, runs the   │
  │  dashboard       │        │  plan in the tab │
  └────────┬─────────┘        └────────┬─────────┘
           │   Bearer token             │
           └────────────┬───────────────┘
                        ▼
             ┌──────────────────────┐
             │  services/api        │   PRIVATE
             │  ─────────────────   │
             │  AI runtime          │
             │  agent registry      │
             │  marketplace         │
             │  authentication      │
             │  billing             │
             │  queue workers       │
             │  database + RLS      │
             └──────────────────────┘
```

**The frontend holds nothing secret.** No database credentials, no Supabase
SDK, no model keys. It signs in by posting to `/v1/auth/login` and keeps the
returned token pair; every other call carries that token as a Bearer
credential.

**The server plans; the browser executes.** The backend never holds the user's
site cookies. It issues an `ActionPlan`, the extension carries it out against
the live page, and reports each step back — which is what makes runs
debuggable rather than a black box.

**Two credential types.** A Supabase user JWT (dashboard, extension) or a
`tp_live_` API key (SDK, scripts). Key management is deliberately
session-only, so a leaked key cannot mint more keys.

### Splitting into two repositories

The boundary is already real — `services/api` shares only `@taskpilot/shared`
with the frontend and imports nothing from `apps/`. To split:

```bash
# Private repo
git filter-repo --path services/api --path packages/shared

# Public repo
git filter-repo --path apps --path packages --path examples --path docs \
                --invert-paths --path services
```

Then publish `@taskpilot/shared` to a registry both can reach, and replace the
`workspace:*` dependency in `services/api/package.json` with a version range.

---

## Deploying

| Piece | Where | Notes |
|---|---|---|
| `services/api` | Any Node host, or a container | `pnpm --filter @taskpilot/api start`; set the env from `.env.example` |
| `apps/web` | Vercel, Netlify, any Next host | Set `NEXT_PUBLIC_API_URL` to the API's public URL |
| Worker | Cron, Vercel Cron, GitHub Actions | `POST /v1/jobs/worker` with `X-Worker-Secret` |
| Extension | Chrome Web Store | Upload the packaged zip |

Set `ALLOWED_ORIGINS` on the API to your dashboard's origin, or CORS will
reject it. `taskpilot.cc`, its subdomains, `localhost` and browser extensions
are allowed by default.

---

## Troubleshooting

**Dashboard shows "Loading your workspace…" forever**
Not signed in, or the API is unreachable. Check `NEXT_PUBLIC_API_URL` and that
`curl http://localhost:4000/health` responds.

**Everything returns `503 not_configured`**
Expected without credentials. The message names the exact variable that is
missing and which file to set it in.

**Extension can't reach the API**
It was built for a different origin. Rebuild with `TASKPILOT_API_ORIGIN` set
and reload it at `chrome://extensions` — the origin is compiled in, not
configurable at runtime.

**Extension isn't signed in after signing in on the web**
Set `NEXT_PUBLIC_EXTENSION_ID` in `apps/web/.env.local` to the ID from
`chrome://extensions`, then reload both.

**`pnpm test --project db` is slow the first time**
It downloads and boots PGlite, a WebAssembly PostgreSQL. Subsequent runs are
about six seconds.
