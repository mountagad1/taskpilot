# 09 · Deployment

| Component | Host | Build |
|---|---|---|
| `apps/web` | Vercel | `turbo build --filter=@taskpilot/web` |
| `services/api` | Railway | Container from `services/api/Dockerfile` |
| Database | Supabase (PostgreSQL) | Migrations in `services/api/db/migrations` |
| Cache / rate limits | Upstash Redis | Optional |

## The build-time trap

**`NEXT_PUBLIC_*` values are inlined into the bundle at build time.** Changing
one in the hosting dashboard does nothing until the app is rebuilt.

This has bitten this project twice — once with a placeholder Supabase URL, once
with `NEXT_PUBLIC_API_URL` defaulting to `http://localhost:4000` in production,
which made every visitor's browser call *their own machine*. Both looked like
network failures and neither was.

If a frontend value looks wrong in production, check the deployed bundle before
checking the dashboard.

## Runtime requirements

Node **≥ 22.13**, pinned to 24 via `.nvmrc` / `.node-version`.

The floor is not arbitrary: `packageManager` pins pnpm 11, which imports
`node:sqlite` — absent on Node 20. An `engines.node` of `>=20` once let a host
provision Node 20 and the install crashed before any application code ran.

## The API container

Built from the **repository root**, not `services/api`, because the service
depends on workspace packages outside its own directory.

Every workspace manifest is copied before installing: `--frozen-lockfile`
validates the lockfile against all projects in `pnpm-workspace.yaml`, so
omitting even an unrelated `package.json` fails with
`ERR_PNPM_OUTDATED_LOCKFILE`.

> Railway: leave **Root Directory at the repository root**. Pointing it at
> `services/api` makes the workspace packages unreachable.

## Environment variables

**Required for the API to do anything useful**

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Database — note: no `NEXT_PUBLIC_` prefix |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side database access |

**Required for correctness**

| Variable | Purpose |
|---|---|
| `PUBLIC_API_URL` | This service's public origin — OAuth redirects |
| `PUBLIC_APP_URL` | The web app's origin — email and Stripe redirects |

**Optional** — each disables one feature when absent

`OPENAI_API_KEY` / `ANTHROPIC_API_KEY`, `STRIPE_*`, `HUBSPOT_*` +
`INTEGRATION_ENCRYPTION_KEY`, `UPSTASH_REDIS_*`, `WORKER_SECRET`.

**Frontend only (Vercel)**

`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_EXTENSION_ID`,
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.

Do not set `PORT` — the host injects it and the server reads it.

## Health

`GET /health` reports which subsystems are live. It is the Railway healthcheck
path and the first thing to check when a feature returns `503`.

```json
{ "status": "ok", "database": "configured", "ai": "unconfigured" }
```

## Splitting the repository

The public/private split is a move, not a rewrite — see
[RUNNING.md](../../RUNNING.md#splitting-into-two-repositories).
