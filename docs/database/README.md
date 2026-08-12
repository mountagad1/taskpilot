# Database

PostgreSQL, via Supabase. Row-level security is the authorization backstop, not
a convenience.

**Lives in** `services/api/db/`

| Path | Contents |
|---|---|
| `schema.sql` | Full current schema |
| `migrations/` | Seven ordered migrations |
| `functions/` | Database functions (e.g. `notify_user`) |
| `tests/` | RLS and migration tests |
| `config.toml` | Supabase CLI configuration |

> The schema moved under `services/api/` with the backend split. It is no
> longer a top-level `supabase/` directory.

## Migrations

| File | Adds |
|---|---|
| `001_initial_schema.sql` | Profiles, settings, core execution tables |
| `002_marketplace.sql` | Listings, purchases, reviews |
| `003_agent_registry.sql` | Versions, manifests, installs |
| `004_runtime.sql` | Runs, steps, AI requests, cache |
| `005_teams.sql` | Teams, members, invites |
| `006_platform.sql` | Keys, notifications, analytics |
| `007_oauth.sql` | Integrations, encrypted tokens |

Ordered and additive. Applying them in sequence to an empty database must
produce `schema.sql`.

## Row-level security

Every table carrying user or team data has policies restricting access to its
owner. The application layer also checks, but RLS is what makes a forgotten
`WHERE user_id = …` a bug rather than a breach.

`tests/migrations.test.mjs` asserts this directly — 52 cases, including:

- team members see their own team and not others'
- one user cannot read another user's integration

These run in CI alongside the unit suite and take roughly 21 seconds.

## Sensitive columns

| Data | Treatment |
|---|---|
| OAuth tokens | Encrypted AES-256-GCM (`lib/crypto.ts`) |
| API keys | Stored hashed (`lib/keys.ts`) |
| Passwords | Not stored — Supabase Auth |

## Access

`services/api` is the only thing holding `SUPABASE_SERVICE_ROLE_KEY`, which
bypasses RLS. Nothing in `apps/` may hold it, and it must never carry a
`NEXT_PUBLIC_` prefix.

## Entity reference

[04_DOMAIN_MODEL](../architecture/04_DOMAIN_MODEL.md) groups all 33 tables by
purpose.
