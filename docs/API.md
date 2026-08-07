# TaskPilot API

Base URL: `https://api.taskpilot.cc` · Discovery document: `GET /v1`

One surface serves the dashboard, the extension and third-party developers, so
the documented API cannot drift from what the product actually does.

The API is a standalone service: the web app holds no database credentials and
no auth SDK, and reaches this API exactly as any other client does.

---

## Authentication

Two credential types, both presented as a Bearer token:

```http
Authorization: Bearer tp_live_xxxxxxxxxxxx    # developer API key
Authorization: Bearer eyJhbGciOi...            # user access token
```

`X-API-Key: tp_live_…` works too. When both are presented the API key wins.

**API keys** are created at **Dashboard → Developers** (Pro and above). The
secret is returned exactly once — only a SHA-256 digest is stored, so a
database leak yields no usable credentials.

**User tokens** come from `POST /v1/auth/login`:

```jsonc
// POST /v1/auth/login  { "email": "...", "password": "..." }
{
  "data": {
    "access_token": "eyJ…",
    "refresh_token": "…",
    "expires_at": 1800003600,       // absolute seconds since epoch
    "user": { "id": "…", "email": "…", "plan": "pro" }
  }
}
```

| Method | Path | Notes |
|---|---|---|
| `POST` | `/v1/auth/signup` | Returns `{ requires_confirmation: true }` when email confirmation is on |
| `POST` | `/v1/auth/login` | Never distinguishes a wrong password from an unknown account |
| `POST` | `/v1/auth/refresh` | Exchange `refresh_token` for a new pair |
| `POST` | `/v1/auth/logout` | Revokes the token server-side |
| `POST` | `/v1/auth/reset-password` | Always answers the same, so it cannot enumerate accounts |
| `POST` | `/v1/auth/update-password` | Requires a valid access token |
| `GET` | `/v1/me` | Identity, plan and effective scopes |

### Scopes

`agents:read` `agents:write` `agents:publish` `runs:read` `runs:write`
`workflows:read` `workflows:write` `marketplace:read` `exports:write`

A missing scope returns `403` naming what was required. Key management
(`/v1/keys`) is deliberately **session-only**: a leaked key cannot mint more.

---

## Conventions

```jsonc
// Success
{ "data": { … } }

// List
{ "data": [ … ], "meta": { "total": 120, "page": 1, "per_page": 25 } }

// Error
{ "error": { "code": "validation_failed", "message": "…", "issues": [ { "path": "goal", "message": "…" } ] } }
```

Pagination: `?page=1&per_page=25`, capped at 100.

| Code | HTTP | Meaning |
|---|---|---|
| `bad_request` | 400 | Malformed request |
| `unauthorized` | 401 | Missing or invalid credentials |
| `payment_required` | 402 | A paid agent must be purchased first |
| `plan_limit` | 402 | The account's plan does not allow this |
| `forbidden` | 403 | Authenticated, not permitted |
| `not_found` | 404 | No such resource, or not visible to you |
| `conflict` | 409 | Version not newer, duplicate invite, already owned |
| `validation_failed` | 422 | Field-level problems in `issues` |
| `rate_limited` | 429 | Slow down; see `Retry-After` |
| `not_configured` | 503 | The deployment is missing a required service |

Rate limits are per caller, per endpoint. `429` carries `Retry-After` in
seconds; the official SDK honours it automatically.

---

## Agents

### `POST /v1/agents`

Creates a **draft**. Nothing is public until you publish and list it.

```jsonc
{
  "name": "Email Harvester",
  "goal": "Collect every email address on the page",
  "capabilities": ["read_page", "extract_emails", "export_data"],
  "category": "extraction",     // sales marketing extraction ecommerce writing research productivity language engineering automation
  "price_cents": 0,
  "visibility": "private"        // private | team | public
}
```

You cannot declare a capability your own plan does not include, and a
`private` agent may not carry a price.

### `POST /v1/agents/{id}/publish`

Validates the manifest and writes an immutable version.

```jsonc
{
  "manifest": { … },        // omit to derive one from the listing
  "version": "1.1.0",       // omit to bump the patch
  "changelog": "Handle paginated tables",
  "list": true              // also list it in the marketplace
}
```

The version must be **strictly newer** than the current one (`409` otherwise),
and the manifest may not request capabilities the listing does not declare —
buyers consent to the listing, so that is the contract.

Publishing is one transaction: the new version is inserted, the previous one
demoted, and the listing pointer moved. A partial unique index guarantees
exactly one current version per agent.

### `POST /v1/agents/{id}/install`

Adds the agent to the caller's workspace, or upgrades an existing install to
the latest version (`upgraded_from` says which). A paid agent requires a
completed purchase first.

### Other agent endpoints

| Method | Path | Notes |
|---|---|---|
| `GET` | `/v1/agents` | Your own agents |
| `GET` | `/v1/agents/{id}` | Yours, or any listed public one |
| `PATCH` | `/v1/agents/{id}` | Owner only |
| `DELETE` | `/v1/agents/{id}` | Archives instead of deleting once it has sales |
| `GET` | `/v1/agents/{id}/versions` | History; manifest bodies excluded |
| `DELETE` | `/v1/agents/{id}/install` | Uninstall |
| `GET` | `/v1/agents/{id}/reviews` | Public |
| `POST` | `/v1/agents/{id}/reviews` | Requires an install or purchase; one per user |
| `GET` | `/v1/agents/{id}/manifest` | Owner, buyer or installer only |

---

## Runs

**Planning happens on the server; execution happens in the user's browser.**
The backend never holds the user's session cookies, so it hands out a plan and
the extension carries it out against the live page.

### `POST /v1/runs`

```jsonc
{
  "goal": "Extract every product price and export to Excel",
  "agent_id": "…",          // optional: run a published agent instead
  "context": {               // what the content script captured
    "url": "https://example.com/products",
    "title": "Products",
    "visible_text": "…",
    "detected_forms": [],
    "detected_tables": []
  },
  "dry_run": false           // true → plan only, nothing stored
}
```

Returns the run, the `ActionPlan`, and the budgets the executor must respect:

```jsonc
{
  "data": {
    "run": { "id": "…", "status": "running", "steps_total": 4 },
    "plan": { "source": "heuristic", "confidence": 0.95, "steps": [ … ] },
    "limits": { "max_steps": 24, "token_budget": 8000, "timeout_ms": 120000,
                "confirm": ["navigate", "download_file"] }
  }
}
```

`plan.source` is `heuristic` when a rule matched (no model call, no tokens),
`llm` when the planner reasoned, or `workflow` for a baked manifest.

### `POST /v1/runs/{id}/steps`

Report one step. Results over ~32 KB are truncated with a preview.

```jsonc
{ "step_index": 1, "status": "succeeded", "result": { … }, "duration_ms": 240 }
```

### `PATCH /v1/runs/{id}`

Record the outcome. **Idempotent** — a retry after a dropped connection will
not overwrite a recorded result.

```jsonc
{ "status": "completed", "output": { "result": [ … ] }, "tokens_used": 1200 }
```

`GET /v1/runs/{id}` returns the run with its full step timeline.
`POST /v1/runs/{id}/cancel` stops one in flight.

---

## Marketplace

`GET /v1/marketplace/agents` — public, no auth required.

`?q=` `&category=` `&sort=popular|newest|rating|price` `&max_price=` `&free=true`

Only `listed` + `public` agents are ever returned.

---

## Workflows

| Method | Path |
|---|---|
| `GET` `POST` | `/v1/workflows` |
| `GET` `PATCH` `DELETE` | `/v1/workflows/{id}` |

Steps pass through the same validator as agent manifests. A `schedule` trigger
needs a 5-field cron expression and the Pro plan; `next_run_at` is recomputed
whenever the expression changes.

```jsonc
{
  "name": "Nightly price sweep",
  "trigger_type": "schedule",
  "schedule_cron": "0 3 * * 1-5",
  "steps": [ { "id": "s1", "action": { "type": "read_page" }, "save_as": "page" } ]
}
```

Cron is interpreted in **UTC**. Following convention, when both the day-of-month
and day-of-week fields are restricted they are OR-ed, not AND-ed.

---

## Integrations (OAuth)

Connects a user's CRM through the authorization-code flow. Currently
implemented: **HubSpot**.

`GET /v1/integrations/status` — unauthenticated readiness probe. Reports
whether the deployment has credentials and an encryption key, and prints the
**exact redirect URI** that must be registered on the HubSpot app. Check this
first; a redirect URI that differs by even a trailing slash fails the
exchange with a message that does not say why.

### `POST /v1/integrations/{provider}/authorize`

Session credential only. Returns the consent URL to send the browser to.

```jsonc
// Request (all optional)
{ "scopes": ["oauth", "crm.objects.contacts.write"], "return_to": "/dashboard/agents" }

// Response
{ "data": { "authorize_url": "https://app.hubspot.com/oauth/authorize?…",
            "state": "…", "expires_in": 600,
            "redirect_uri": "https://api.taskpilot.cc/v1/integrations/hubspot/callback" } }
```

`return_to` is validated against the dashboard origin. A foreign origin is
dropped rather than honoured — reflecting it would make this an open
redirect.

### `GET /v1/integrations/{provider}/callback`

Called by the provider, not by you. **Unauthenticated by necessity**: it
arrives as a top-level browser navigation carrying no credential, so the
`state` parameter is the entire binding to the user who began the flow.
State is random, single-use, expires in 10 minutes, and is compared in
constant time. It is consumed *before* the token exchange, so a failed
exchange cannot be retried with the same link.

Always redirects — never returns JSON — because a person is waiting in a
browser. Success lands on `?connected=hubspot`; every failure lands on
`?error=<reason>`.

### `POST /v1/integrations/{provider}/push`

```jsonc
{ "records": [ { "email": "ada@example.com", "firstname": "Ada", "company": "…" } ] }
```

Requires `runs:write`. Refreshes the access token first if it expires within
5 minutes. Batches of 100; up to 1000 records per request. Unknown keys pass
through as custom HubSpot properties; empty and null values are dropped
rather than blanking an existing field.

If the connection was granted read-only access the call fails **403 before
contacting HubSpot**, naming the missing scope — HubSpot's own error is a
bare 403 that does not say which scope is absent.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/v1/integrations` | Connections. Never includes tokens. `needs_reconnect` flags a dead grant |
| `DELETE` | `/v1/integrations/{provider}` | Removes the stored grant |

### Token handling

Access and refresh tokens are encrypted with **AES-256-GCM** before storage
and never leave the API — not to the dashboard, not to the extension. A
HubSpot refresh token does not expire on its own, so a database dump holding
one in plaintext would be a standing breach.

`INTEGRATION_ENCRYPTION_KEY` is required. Without it the API refuses to
*start* a flow rather than completing one it cannot store safely.

A refresh that fails records the reason and marks the connection
`needs_reconnect`, so the dashboard can prompt for a reconnect instead of
every run failing with an unexplained 401.

---

## Teams, notifications, keys

| Method | Path | Notes |
|---|---|---|
| `GET` `POST` | `/v1/teams` | Creating requires Pro |
| `GET` `PATCH` `DELETE` | `/v1/teams/{id}/members` | Admin, or removing yourself |
| `GET` `POST` | `/v1/teams/{id}/invites` | Admin only; invites expire in 7 days |
| `POST` | `/v1/teams/invites/accept` | Token must match your email |
| `GET` | `/v1/notifications` | `meta.unread` drives the badge |
| `POST` | `/v1/notifications/read` | Omit `ids` to mark everything |
| `GET` `POST` | `/v1/keys` | Session only |
| `DELETE` | `/v1/keys/{id}` | Revokes; the row is kept for its usage history |

Seat limits are enforced by a database trigger, so an invite cannot be accepted
into a full team even under a race.

---

## Background worker

`POST /v1/jobs/worker` drains one batch of the job queue. Authenticated by
`X-Worker-Secret` (matched in constant time) rather than a user session — there
is no user behind a cron tick. Set `WORKER_SECRET` to enable it.

```bash
curl -X POST https://api.taskpilot.cc/v1/jobs/worker \
  -H "X-Worker-Secret: $WORKER_SECRET"
```

Jobs are claimed with `FOR UPDATE SKIP LOCKED`, so several workers can poll
concurrently without collisions. Failures retry with exponential backoff up to
`max_attempts`, then park as `dead`. Jobs abandoned by a crashed worker are
requeued after 15 minutes.

---

## Capabilities

An agent may only perform the actions it declares, intersected with what the
caller's plan permits. Full metadata: `listCapabilities()` in `@taskpilot/ai-engine`.

| Group | Actions |
|---|---|
| Navigation | `navigate` `go_back` `reload` `open_tab`* `switch_tab`* `close_tab`* |
| Interaction | `click` `type` `clear` `select_option` `check` `hover` `press_key` `submit` `scroll` |
| Waiting | `wait` `wait_for_element` `wait_for_navigation` `assert_text` |
| Reading | `read_page` `extract_text` `extract_table` `extract_links` `extract_emails` `extract_prices` `extract_structured` `screenshot`* |
| Forms | `detect_forms` `fill_form` `smart_paste` |
| Files | `upload_file`* `download_file`* |
| AI | `summarize` `translate` `rewrite` `generate_reply` `ask_ai` |
| Output | `export_data` `push_integration`* `notify` |

\* Pro plan or above.

`navigate`, `download_file`, `upload_file` and `push_integration` require user
confirmation by default. URLs are restricted to `http(s)` at three
independent layers — manifest validation, plan validation and the executor —
so a `javascript:` payload can never reach a navigation.

---

## SDK

```bash
npm install @taskpilot/sdk
```

See [`packages/sdk/README.md`](../packages/sdk/README.md) and
[`examples/`](../examples).
