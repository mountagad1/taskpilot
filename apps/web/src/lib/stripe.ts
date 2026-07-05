// ============================================================
// TASKPILOT — STRIPE INTEGRATION
// apps/web/src/lib/stripe.ts
// Checkout, webhooks, customer portal
// ============================================================

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
  typescript: true,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── PRICE IDS ───────────────────────────────────────────────

export const STRIPE_PRICES = {
  pro_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY!,
  pro_annual: process.env.STRIPE_PRICE_PRO_ANNUAL!,
  enterprise_monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY!,
} as const;

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
    const customer = await stripe.customers.create({
      email,
      metadata: { supabase_user_id: userId },
    });
    stripeCustomerId = customer.id;
    await supabase
      .from("profiles")
      .update({ stripe_customer_id: stripeCustomerId })
      .eq("id", userId);
  }

  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
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
  if (!stripeCustomerId) throw new Error("No Stripe customer found");

  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: params.returnUrl,
  });

  return { url: session.url };
}

// ─── WEBHOOK HANDLER ─────────────────────────────────────────

export async function handleWebhookEvent(
  body: string,
  signature: string
): Promise<void> {
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    throw new Error(`Webhook signature verification failed: ${err}`);
  }

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;

    case "customer.subscription.created":
    case "customer.subscription.updated":
      await handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
      break;

    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;

    case "invoice.payment_succeeded":
      await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
      break;

    case "invoice.payment_failed":
      await handlePaymentFailed(event.data.object as Stripe.Invoice);
      break;

    default:
      console.log(`[Stripe] Unhandled event: ${event.type}`);
  }

  // Log all events
  await supabase.from("billing_events").insert({
    stripe_event_id: event.id,
    event_type: event.type,
    metadata: event.data.object,
  });
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
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.supabase_user_id;
  if (!userId) {
    // Try to find user by customer ID
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("stripe_customer_id", subscription.customer)
      .single();
    if (!profile) return;
  }

  const targetUserId = userId || (await getUserByCustomerId(subscription.customer as string));
  if (!targetUserId) return;

  // Determine plan from price
  const priceId = subscription.items.data[0]?.price.id;
  const plan = getPlanFromPriceId(priceId);

  // Upsert subscription record
  await supabase.from("subscriptions").upsert(
    {
      user_id: targetUserId,
      stripe_subscription_id: subscription.id,
      stripe_price_id: priceId,
      plan,
      status: subscription.status as string,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
    },
    { onConflict: "stripe_subscription_id" }
  );

  // Update user plan
  await supabase
    .from("profiles")
    .update({ plan: subscription.status === "active" ? plan : "free" })
    .eq("id", targetUserId);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const userId = await getUserByCustomerId(subscription.customer as string);
  if (!userId) return;

  await supabase
    .from("profiles")
    .update({ plan: "free" })
    .eq("id", userId);

  await supabase
    .from("subscriptions")
    .update({ status: "canceled" })
    .eq("stripe_subscription_id", subscription.id);
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
  const { data } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .single();
  return data?.stripe_customer_id || null;
}

async function getUserByCustomerId(customerId: string): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .single();
  return data?.id || null;
}

function getPlanFromPriceId(priceId: string): "pro" | "enterprise" {
  if (priceId === STRIPE_PRICES.enterprise_monthly) return "enterprise";
  return "pro";
}

// ─── PLAN FEATURES ───────────────────────────────────────────

export const PLAN_FEATURES = {
  free: {
    name: "Free",
    price: 0,
    ai_actions: 20,
    exports: 3,
    automations: 0,
    features: [
      "20 AI actions/month",
      "3 exports/month",
      "Smart Paste",
      "Basic extraction",
      "Community support",
    ],
    cta: "Get Started Free",
  },
  pro: {
    name: "Pro",
    price_monthly: 19,
    price_annual: 190,
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
