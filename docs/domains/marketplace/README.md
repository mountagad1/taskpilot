# Domain · Marketplace

Publish, discover, buy and sell agents. TaskPilot is the intermediary and
retains a platform fee on each transaction.

**Owns** `services/api/src/lib/marketplace.ts`

| Surface | Route |
|---|---|
| Browse, publish, purchase | `/v1/marketplace` (`routes/platform.ts`) |

## Data

| Table | Holds |
|---|---|
| `marketplace_agents` | Listings |
| `agent_purchases` | Purchase record and fee split |
| `agent_reviews` | Ratings |
| `agent_installs` | What a buyer installed |
| `referrals` | Attribution |

## Transaction model

Payment flows to the platform Stripe account, and `agent_purchases` records the
split between platform fee and seller earnings.

This is a **ledger model**: the split is recorded at purchase time and payouts
are settled separately. It is the simpler first step; Stripe Connect would move
settlement into Stripe itself and is the natural upgrade when seller volume
justifies the onboarding burden.

## What a buyer receives

The agent manifest — the full model-plus-harness definition: capabilities,
workflow steps, token budget and deploy targets. Manifests are versioned
(`agent_versions`, `agent_manifests`), so a purchase references an exact
version rather than whatever the seller later edits.

Free agents skip Stripe entirely and are granted immediately.

## Access control

Manifest download is ownership-gated. Row-level security enforces it at the
database, not only in the handler
([08_SECURITY_MODEL](../../architecture/08_SECURITY_MODEL.md#authorization)).

## See also

[billing](../billing/) · [workflows](../workflows/) · [04_DOMAIN_MODEL](../../architecture/04_DOMAIN_MODEL.md#marketplace)
