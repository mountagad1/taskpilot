# Domain · Billing

Plans, quotas and Stripe. **Full audit and target design:**
[11_BILLING_ARCHITECTURE](../../architecture/11_BILLING_ARCHITECTURE.md) —
read that before changing anything here, it corrects claims this page used
to make.

**Owns** `services/api/src/lib/billing.ts`

| Surface | Route | Status |
|---|---|---|
| Marketplace agent purchase | `POST /v1/billing/checkout` (`routes/misc.ts`) | Live |
| Stripe webhook | `POST /v1/billing/webhook` | Live, not idempotent yet |
| Subscription checkout | — | **Missing.** `createCheckoutSession()` exists in `billing.ts` but no route calls it — there is currently no way to buy Pro. |
| Billing portal | — | **Missing.** `createPortalSession()` exists, unused. |

## Plans

| Plan | AI actions / month | Exports / month |
|---|---|---|
| Free | 30 | 5 |
| Pro | Unlimited | Unlimited |
| Enterprise | Unlimited | Unlimited |

Unlimited is represented as `-1` and short-circuits the count query.

**The authoritative source is `PLAN_LIMITS` in `packages/shared/src/types`** —
that is what `assertWithinPlanLimits` reads. `PLAN_FEATURES` in `billing.ts` is
presentation copy; it must be kept in step but nothing enforces from it.

> These two once disagreed — the site advertised 30 actions while the API
> enforced 20. If you change a limit, change both, and check the pricing page.

## Quota accounting

`lib/runs.ts` counts `agent_runs` since the start of the calendar month (UTC)
to enforce the AI-action limit, before planning, so an over-limit request
costs nothing. It is a count-then-insert check, not atomic — see
[11_BILLING_ARCHITECTURE §1.5](../../architecture/11_BILLING_ARCHITECTURE.md#15-usage-race-condition)
for the race this leaves open.

**The advertised export limit is not enforced.** `exportRoutes.post("/")`
never checks `exports_limit` — a Free-tier account can generate unlimited
exports today.

## Stripe

| Concern | Detail |
|---|---|
| Checkout | Sessions created server-side |
| Webhook | Signature verified with `STRIPE_WEBHOOK_SECRET` |
| Prices | Configured via `STRIPE_PRICE_*` env vars, not hard-coded |
| State | `subscriptions`, `billing_events` |

Price IDs are environment configuration so test and live modes differ without a
code change.

Absent Stripe credentials, billing returns `503 not_configured` and the rest of
the product keeps working.

## See also

[marketplace](../marketplace/) · [09_DEPLOYMENT](../../architecture/09_DEPLOYMENT.md#environment-variables)
