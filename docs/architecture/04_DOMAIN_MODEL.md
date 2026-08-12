# 04 · Domain Model

Schema lives in `services/api/db/schema.sql`, applied through seven ordered
migrations in `services/api/db/migrations/`. Full reference:
[database/](../database/).

## Entity groups

### Identity and access

| Table | Holds |
|---|---|
| `profiles` | User record, plan |
| `user_settings`, `notification_preferences` | Per-user preferences |
| `teams`, `team_members`, `team_invites` | Collaboration and membership |
| `api_keys`, `api_key_usage` | Programmatic access, hashed keys |
| `anonymous_sessions` | Pre-signup usage |

### Agents

| Table | Holds |
|---|---|
| `agent_versions` | Immutable manifest versions |
| `agent_manifests` | Manifest bodies |
| `agent_installs` | Which user installed what |
| `agent_shares` | Team-level sharing |

An agent is versioned rather than mutated, so a run always references the exact
manifest that produced it.

### Execution

| Table | Holds |
|---|---|
| `agent_runs` | One run of an agent |
| `agent_run_steps` | Individual planned/executed steps |
| `workflows`, `workflow_runs` | Saved automations and their history |
| `job_queue` | Deferred and scheduled work |
| `stored_files` | Uploads and generated artifacts |

`agent_runs` is also the quota unit: the free-tier limit counts rows here since
the start of the calendar month.

### Marketplace

| Table | Holds |
|---|---|
| `marketplace_agents` | Listings |
| `agent_purchases` | Purchase records and fee split |
| `agent_reviews` | Ratings and reviews |
| `referrals` | Referral attribution |

### AI

| Table | Holds |
|---|---|
| `ai_requests` | Model call records |
| `response_cache` | Semantic cache entries |
| `saved_prompts` | Reusable user prompts |

### Commerce and telemetry

| Table | Holds |
|---|---|
| `subscriptions`, `billing_events` | Stripe state and event log |
| `usage_periods` | Quota accounting windows |
| `analytics_events`, `productivity_metrics` | Usage and outcome metrics |
| `notifications` | User-facing messages |
| `integrations`, `oauth_states` | Third-party connections, tokens encrypted at rest |

## Rules that hold across the model

**Ownership is explicit.** Rows carry the owning user or team, and row-level
security enforces it at the database rather than trusting the query.

**Credentials are never stored in plaintext.** OAuth tokens are encrypted
(`lib/crypto.ts`); API keys are stored hashed (`lib/keys.ts`).

**History is append-only where it matters.** Runs, steps, purchases and billing
events are records of what happened, not mutable current state.
