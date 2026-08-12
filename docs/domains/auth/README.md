# Domain · Auth

Identity, sessions, programmatic access and teams.

**Owns** `services/api/src/routes/auth.ts`, `lib/keys.ts`

| Surface | Route |
|---|---|
| Signup, signin, reset | `/v1/auth` |
| API keys | `/v1/keys` (`routes/platform.ts`) |
| Teams and invites | `/v1/teams` (`routes/platform.ts`) |

## Two ways to authenticate

| Caller | Credential |
|---|---|
| Browser / extension | Supabase session (bearer token) |
| Script / SDK | API key, scoped |

Both resolve to the same caller object, so route guards do not care which was
used.

## Passwords

Never stored here — delegated to Supabase Auth.

## API keys

Stored **hashed** and shown exactly once at creation. A leaked database does not
yield usable keys. Usage is recorded in `api_key_usage`; scopes come from
`API_SCOPES` in `@taskpilot/shared`.

## Email confirmation

`signUp` passes `emailRedirectTo` explicitly rather than relying on the Supabase
dashboard "Site URL", which platform integrations can rewrite without notice.

The redirect is built from `PUBLIC_APP_URL`. Supabase additionally requires the
URL to be present in the project's **Redirect URLs allowlist** — without it,
Supabase silently falls back to Site URL and confirmation links go astray.

## Teams

`teams`, `team_members`, `team_invites`. Membership is enforced by row-level
security, tested directly: members see their own team and not others'.

## See also

[08_SECURITY_MODEL](../../architecture/08_SECURITY_MODEL.md) ·
[guides/hubspot-setup](../../guides/hubspot-setup.md)
