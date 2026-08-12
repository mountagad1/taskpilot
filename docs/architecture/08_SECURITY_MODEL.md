# 08 · Security Model

## Trust boundaries

```text
  Untrusted            Semi-trusted           Trusted
  ─────────            ────────────           ───────
  Web page       │     Extension        │     services/api
  DOM contents   │     User's session   │     Service-role DB access
  Page scripts   │     No secrets       │     Model keys, Stripe keys
```

Page content is **data, never instruction**. Text extracted from a page is
never treated as a command to the planner.

## Where secrets live

`services/api` is the only package holding credentials. It imports nothing from
`apps/`, and shares only `@taskpilot/shared`.

| Secret | Held by |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | API only — bypasses row-level security |
| Model provider keys | API only |
| Stripe secret and webhook secret | API only |
| `INTEGRATION_ENCRYPTION_KEY` | API only |
| `WORKER_SECRET` | API only |

Anything named `NEXT_PUBLIC_*` is compiled into the browser bundle and is
public by definition. Nothing sensitive may use that prefix.

## Authorization

Two layers, and the second is the one that must not be skipped:

1. **Application** — route guards resolve the caller and their scopes.
2. **Database** — row-level security policies restrict what that caller can
   read or write.

RLS is the backstop: a forgotten `WHERE user_id = …` should be a bug, not a
breach. `db/tests/migrations.test.mjs` asserts this directly, including that
team members see their own team but not others', and that one user cannot read
another user's integration.

## Credentials at rest

| Credential | Treatment |
|---|---|
| OAuth tokens | Encrypted, AES-256-GCM (`lib/crypto.ts`) |
| API keys | Stored hashed, shown once (`lib/keys.ts`) |
| Passwords | Never stored — delegated to Supabase Auth |

The API refuses to start an OAuth flow without `INTEGRATION_ENCRYPTION_KEY`
rather than storing a token in plaintext. A HubSpot refresh token does not
expire on its own, so a database dump containing one is a standing breach.

## Browser-facing controls

**CORS** (`app.ts` · `isAllowedOrigin`) allows `https://taskpilot.cc` and its
subdomains, `http://localhost`, and extension origins. Extension origins are
unpredictable per install, so the *scheme* is what is trusted — the browser
guarantees only an installed extension can present it. Additional origins come
from `ALLOWED_ORIGINS`.

**CSP** is set in `apps/web/src/middleware.ts`, with `connect-src` derived from
`NEXT_PUBLIC_API_URL` so the allowlist cannot drift from the configured backend.

**Rate limiting** is per-route (`guard({ rateLimit })`), backed by Redis when
configured and per-process memory otherwise — correct either way, shared only
with Redis.

## Redirects

`emailRedirectTo` is passed explicitly on signup rather than relying on the
Supabase dashboard "Site URL", which platform integrations can rewrite. Supabase
additionally requires the URL to be in the project's allowlist.
