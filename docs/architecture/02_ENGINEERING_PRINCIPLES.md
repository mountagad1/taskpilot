# 02 · Engineering Principles

These are not aspirations. Each one is observable in the code, with the place it
is enforced.

## 1. Degrade, never crash

A missing credential disables the feature that needs it and returns
`503 not_configured`. It does not take down the process, and it does not fail
silently.

`GET /health` reports which subsystems are live, so "is it broken or is it
unconfigured?" is answerable in one request.

> `services/api/src/server.ts` prints the same live/disabled split at boot.

The web app follows the rule too: `lib/server-api.ts` helpers return a fallback
rather than throwing, because an unreachable API should degrade a page, not
500 it.

## 2. Heuristics before models

The planner resolves what it can deterministically and calls a model only when
it must. Model calls cost money and latency, and a deterministic path is
testable.

> `runtime/planner/heuristics.ts`, then `runtime/providers`.

With no API key at all, the mock provider keeps the system testable and
heuristic planning still resolves common tasks.

## 3. Secrets live in exactly one place

`services/api` is the only package that holds credentials. It imports nothing
from `apps/`, and shares only `@taskpilot/shared`.

That boundary is what makes the public/private repository split possible without
a rewrite — see [09_DEPLOYMENT](09_DEPLOYMENT.md).

## 4. Plan on the server, execute on the client

Prompts and keys stay server-side. DOM access stays client-side, reusing the
user's existing sessions rather than replaying credentials on a server.

## 5. Configure explicitly rather than derive

Behind a proxy the incoming request URL is not the public one, so values like
`PUBLIC_API_URL` are configured, not inferred from the request.

The same rule applies to redirects: `signUp` passes `emailRedirectTo` rather
than relying on a dashboard setting an integration can rewrite.

## 6. Enforce authorization at the database

Row-level security is the backstop, not the application layer. A missing
`WHERE user_id = …` should not become a data leak.

> Tested directly in `services/api/db/tests/migrations.test.mjs`.

## 7. Say what is wrong, precisely

Errors name the thing that is misconfigured and what to do about it. A network
failure and a rejected credential must not read the same to a user — that
distinction is the difference between "try again" and "call support".

## 8. Tests cover the boundaries

The suite favours the seams where mistakes are expensive: RLS policies, cron
arithmetic, OAuth token handling, key hashing, plan limits.
