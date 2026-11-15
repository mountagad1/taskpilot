// ============================================================
// TASKPILOT — STRIPE INTEGRATION
// services/api/src/lib/billing.ts
// Checkout, webhooks, customer portal
// ============================================================

import Stripe from "stripe";
import { getStripe, getAdminClient } from "./clients";
import { notConfigured, notFound } from "./errors";

// Both clients resolve per-call so this module stays importable during
// module import time, when no secrets are present. See clients.ts.
const stripe = () => getStripe();
const supabase = () => getAdminClient();

export type PaidPlan = "pro" | "enterprise";
export type BillingInterval = "monthly" | "annual";

// ─── PRICE IDS ───────────────────────────────────────────────

/** Read at call time — env is not populated when this module is first imported. */
export function stripePrices() {
  return {
    pro_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY ?? "",
    pro_annual: process.env.STRIPE_PRICE_PRO_ANNUAL ?? "",
    enterprise_monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY ?? "",
  } as const;
}

/**
 * The plan a configured price grants, or null for any price we do not know.
 * An unknown price must never grant a paid plan: it may be a retired price,
 * a test-mode id, or a product unrelated to the subscription tiers.
 */
export function planForPrice(priceId: string | null | undefined): PaidPlan | null {
  if (!priceId) return null;
  const prices = stripePrices();
  // Unset env vars are "" and the guard above means "" never matches.
  if (priceId === prices.enterprise_monthly) return "enterprise";
  if (priceId === prices.pro_monthly || priceId === prices.pro_annual) return "pro";
  return null;
}

/** The configured price for a plan/interval, or null if it is not offered. */
export function priceForPlan(plan: PaidPlan, interval: BillingInterval): string | null {
  const prices = stripePrices();
  const id =
    plan === "pro"
      ? interval === "annual"
        ? prices.pro_annual
        : prices.pro_monthly
      : interval === "monthly"
        ? prices.enterprise_monthly
        : "";
  return id || null;
}

// ─── STATUS → ENTITLEMENT ────────────────────────────────────

/**
 * What a subscription in `status` does to the user's plan:
 * - `grant`: the subscription confers its plan. `past_due` is included as a
 *   grace period — Stripe is still retrying the payment and moves the
 *   subscription to `unpaid`/`canceled` if dunning fails.
 * - `revoke`: the subscription no longer confers anything.
 * - `none`: leave the plan alone. `incomplete` means the first payment has
 *   not succeeded yet (e.g. awaiting 3DS) — no access until it does, but it
 *   is not a reason to take away a plan the user already holds.
 */
export type Entitlement = "grant" | "revoke" | "none";

export const GRANTING_STATUSES = ["active", "trialing", "past_due"] as const;

export function entitlementForStatus(status: string): Entitlement {
  switch (status) {
    case "active":
    case "trialing":
    case "past_due":
      return "grant";
    case "unpaid":
    case "canceled":
    case "incomplete_expired":
    case "paused":
      return "revoke";
    case "incomplete":
      return "none";
    default:
      console.warn(`[Stripe] Unknown subscription status "${status}" — plan left unchanged`);
      return "none";
  }
}

// ─── APP URLS ────────────────────────────────────────────────

/**
 * The dashboard origin every Stripe success/cancel/return URL is built on.
 * Never derive these from the request (Origin, Referer, a body field): an
 * API caller could then send a paying user to any site after checkout.
 */
export function appOrigin(): string {
  const configured = process.env.PUBLIC_APP_URL;
  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      throw notConfigured("Set PUBLIC_APP_URL so Stripe can return users to the app");
    }
    return "http://localhost:3000";
  }
  return configured.replace(/\/+$/, "");
}

function withQuery(url: string, query: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}${query}`;
}

// ─── CREATE CHECKOUT SESSION ──────────────────────────────────

export async function createCheckoutSession(params: {
  userId: string;
  email: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  trialDays?: number;
}): Promise<{ url: string }> {
  const { userId, email, priceId, successUrl, cancelUrl, trialDays } = params;

  // Get or create Stripe customer
  let stripeCustomerId = await getStripeCustomerId(userId);
  if (!stripeCustomerId) {
    const customer = await stripe().customers.create({
      email: email || undefined,
      metadata: { supabase_user_id: userId },
    });
    stripeCustomerId = customer.id;
    const { error } = await supabase()
      .from("profiles")
      .update({ stripe_customer_id: stripeCustomerId })
      .eq("id", userId);
    if (error) throw new Error(`Failed to link Stripe customer: ${error.message}`);
  }

  const session = await stripe().checkout.sessions.create({
    customer: stripeCustomerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: withQuery(successUrl, "session_id={CHECKOUT_SESSION_ID}"),
    cancel_url: cancelUrl,
    subscription_data: {
      trial_period_days: trialDays,
      metadata: { supabase_user_id: userId },
    },
    metadata: { supabase_user_id: userId },
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    customer_update: { address: "auto" },
  });

  if (!session.url) throw new Error("Failed to create checkout session");
  return { url: session.url };
}

// ─── CUSTOMER PORTAL ─────────────────────────────────────────

export async function createPortalSession(params: {
  userId: string;
  returnUrl: string;
}): Promise<{ url: string }> {
  const stripeCustomerId = await getStripeCustomerId(params.userId);
  if (!stripeCustomerId) throw notFound("No billing account yet — subscribe to a plan first");

  const session = await stripe().billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: params.returnUrl,
  });

  return { url: session.url };
}

/** True when the user already holds a subscription that confers a plan. */
export async function hasLiveSubscription(userId: string): Promise<boolean> {
  const { data, error } = await supabase()
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .in("status", [...GRANTING_STATUSES]);
  if (error) throw new Error(`Failed to read subscriptions: ${error.message}`);
  return Array.isArray(data) && data.length > 0;
}

// ─── WEBHOOK HANDLER ─────────────────────────────────────────

/** Thrown for a bad/missing signature — the only webhook failure that is the caller's fault. */
export class WebhookSignatureError extends Error {}

const UNIQUE_VIOLATION = "23505";

/**
 * Verifies and processes a Stripe event exactly once.
 *
 * Idempotency: the event id is claimed in `billing_events` (UNIQUE on
 * stripe_event_id) BEFORE any processing. A redelivery of an event we have
 * already handled hits the constraint and is acknowledged without being
 * reprocessed. If processing fails the claim is released, so Stripe's retry
 * gets a clean second attempt instead of being swallowed as a duplicate.
 *
 * Ordering: subscription events are not applied from their payload. Stripe
 * does not guarantee delivery order, so a late `subscription.updated`
 * carrying "active" could otherwise overwrite a newer cancellation. Instead
 * every subscription event re-fetches the subscription from the Stripe API
 * and applies its CURRENT state — whichever event arrives last, the result
 * is the latest truth. See syncSubscription.
 */
export async function handleWebhookEvent(
  body: string,
  signature: string
): Promise<{ duplicate: boolean; type: string }> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw notConfigured("Set STRIPE_WEBHOOK_SECRET to receive Stripe webhooks");

  let event: Stripe.Event;

  try {
    event = stripe().webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    throw new WebhookSignatureError(`Webhook signature verification failed: ${err}`);
  }

  // Claim the event first.
  const { error: claimError } = await supabase().from("billing_events").insert({
    stripe_event_id: event.id,
    event_type: event.type,
    metadata: event.data.object,
  });

  if (claimError) {
    if (claimError.code === UNIQUE_VIOLATION) {
      console.log(`[Stripe] Duplicate event ${event.id} (${event.type}) — already processed`);
      return { duplicate: true, type: event.type };
    }
    // Could not record it: fail so Stripe retries rather than risk a double-apply later.
    throw new Error(`Failed to record billing event ${event.id}: ${claimError.message}`);
  }

  try {
    await dispatch(event);
  } catch (err) {
    // Release the claim so the retry Stripe will send is processed.
    await supabase().from("billing_events").delete().eq("stripe_event_id", event.id);
    throw err;
  }

  return { duplicate: false, type: event.type };
}

async function dispatch(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      // The payload is only a fallback for when Stripe no longer has the object.
      await syncSubscription(subscription.id, subscription);
      break;
    }

    case "invoice.payment_succeeded":
      await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
      break;

    case "invoice.payment_failed":
      await handlePaymentFailed(event.data.object as Stripe.Invoice);
      break;

    default:
      console.log(`[Stripe] Unhandled event: ${event.type}`);
  }
}

// ─── EVENT HANDLERS ──────────────────────────────────────────

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  // Marketplace agent purchase → grant the buyer access and split the fee.
  if (session.metadata?.type === "agent_purchase") {
    const { fulfillAgentPurchase } = await import("./marketplace");
    await fulfillAgentPurchase(session);
    return;
  }

  const userId = session.metadata?.supabase_user_id;
  if (!userId) return;

  console.log(`[Stripe] Checkout completed for user: ${userId}`);

  // Grant access as soon as checkout completes rather than waiting for the
  // subscription event, which may arrive later. Safe to repeat: the sync is
  // state-based, not event-based.
  if (session.mode === "subscription" && session.subscription) {
    const id = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
    await syncSubscription(id);
  }
}

/**
 * Applies a subscription's current state, fetched from Stripe.
 *
 * Re-fetching makes processing order-independent and idempotent: an old,
 * retried or out-of-order event cannot resurrect a cancelled plan, because
 * what gets written is what Stripe says now, not what the event said then.
 * `fallback` is used only if Stripe reports the subscription missing.
 */
export async function syncSubscription(subscriptionId: string, fallback?: Stripe.Subscription): Promise<void> {
  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe().subscriptions.retrieve(subscriptionId);
  } catch (err) {
    const missing = (err as { code?: string } | null)?.code === "resource_missing";
    if (!missing || !fallback) throw err;
    subscription = fallback;
  }
  await applySubscriptionState(subscription);
}

async function applySubscriptionState(subscription: Stripe.Subscription) {
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;

  const targetUserId =
    subscription.metadata?.supabase_user_id || (customerId ? await getUserByCustomerId(customerId) : null);
  if (!targetUserId) {
    console.warn(`[Stripe] Subscription ${subscription.id} has no matching user — ignored`);
    return;
  }

  const priceId = subscription.items?.data[0]?.price?.id ?? null;
  const pricePlan = planForPrice(priceId);
  if (!pricePlan) {
    console.warn(
      `[Stripe] Subscription ${subscription.id} uses unconfigured price ${priceId ?? "(none)"} — no plan granted`
    );
  }

  // The subscriptions row needs a plan; for an unknown price keep whatever it
  // last recorded (or "free" for a new row) so nothing is granted by it.
  const { data: existing } = await supabase()
    .from("subscriptions")
    .select("plan")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();

  const { error: upsertError } = await supabase().from("subscriptions").upsert(
    {
      user_id: targetUserId,
      stripe_subscription_id: subscription.id,
      stripe_price_id: priceId,
      plan: pricePlan ?? existing?.plan ?? "free",
      status: subscription.status,
      current_period_start: toIso(subscription.current_period_start),
      current_period_end: toIso(subscription.current_period_end),
      cancel_at_period_end: subscription.cancel_at_period_end,
      trial_end: toIso(subscription.trial_end),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" }
  );
  if (upsertError) throw new Error(`Failed to store subscription: ${upsertError.message}`);

  const entitlement = entitlementForStatus(subscription.status);
  let plan: string | null = null;

  if (entitlement === "grant") {
    // Unknown price → leave the plan as it is.
    plan = pricePlan;
  } else if (entitlement === "revoke") {
    // Fall back to another live subscription the user holds, if any.
    plan = (await bestOtherPlan(targetUserId, subscription.id)) ?? "free";
  }

  if (!plan) return;

  const { error } = await supabase().from("profiles").update({ plan }).eq("id", targetUserId);
  if (error) throw new Error(`Failed to update plan: ${error.message}`);
}

async function bestOtherPlan(userId: string, excludeSubscriptionId: string): Promise<PaidPlan | null> {
  const { data, error } = await supabase()
    .from("subscriptions")
    .select("plan, stripe_subscription_id")
    .eq("user_id", userId)
    .in("status", [...GRANTING_STATUSES]);
  if (error) throw new Error(`Failed to read subscriptions: ${error.message}`);

  const plans = ((data ?? []) as Array<{ plan: string; stripe_subscription_id: string }>)
    .filter((row) => row.stripe_subscription_id !== excludeSubscriptionId)
    .map((row) => row.plan);
  if (plans.includes("enterprise")) return "enterprise";
  if (plans.includes("pro")) return "pro";
  return null;
}

function toIso(seconds: number | null | undefined): string | null {
  return typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null;
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  console.log(`[Stripe] Payment succeeded: ${invoice.id}`);
  // Could trigger email, update analytics, etc.
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  console.log(`[Stripe] Payment failed: ${invoice.id}`);
  // Could trigger dunning email, etc.
}

// ─── HELPERS ─────────────────────────────────────────────────

async function getStripeCustomerId(userId: string): Promise<string | null> {
  const { data } = await supabase()
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();
  return data?.stripe_customer_id || null;
}

async function getUserByCustomerId(customerId: string): Promise<string | null> {
  const { data } = await supabase()
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data?.id || null;
}

// ─── PLAN FEATURES ───────────────────────────────────────────

export const PLAN_FEATURES = {
  free: {
    name: "Free",
    price: 0,
    ai_actions: 30,
    exports: 5,
    automations: 0,
    features: [
      "30 AI actions/month",
      "5 exports/month",
      "Smart Paste",
      "Basic extraction",
      "Community support",
    ],
    cta: "Get Started Free",
  },
  pro: {
    name: "Pro",
    price_monthly: 39.99,
    price_annual: 383.9,
    ai_actions: -1, // unlimited
    exports: -1,
    automations: -1,
    features: [
      "Unlimited AI actions",
      "Unlimited exports",
      "Unlimited automations",
      "AI Sidebar",
      "Browser workflows",
      "CRM integrations",
      "Premium AI models",
      "Workflow history",
      "Advanced exports (Excel, PDF)",
      "Priority support",
      "API access",
    ],
    cta: "Start Pro Trial",
    popular: true,
  },
  enterprise: {
    name: "Enterprise",
    price: null,
    ai_actions: -1,
    exports: -1,
    automations: -1,
    features: [
      "Everything in Pro",
      "Custom AI models",
      "SSO/SAML",
      "Admin dashboard",
      "Team management",
      "Custom integrations",
      "SLA guarantee",
      "Dedicated support",
      "Custom contracts",
      "On-premise option",
    ],
    cta: "Contact Sales",
  },
} as const;
