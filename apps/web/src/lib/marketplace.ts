// ============================================================
// TASKPILOT — AGENT MARKETPLACE (server)
// apps/web/src/lib/marketplace.ts
// Checkout, 10% platform-fee split, purchase fulfillment.
// TaskPilot is the intermediary: the buyer pays into TaskPilot's
// Stripe account; the ledger records the 90/10 split and grants
// the buyer access to the agent manifest. Seller payouts settle
// out of this ledger (see agent_purchases.seller_earnings_cents).
// ============================================================

import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

export const PLATFORM_FEE_RATE = 0.1 // TaskPilot keeps 10% of each sale

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
  typescript: true,
})

// Service-role client — purchases and sales counters are written
// server-side only (RLS blocks client writes to agent_purchases).
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface AgentRow {
  id: string
  seller_id: string | null
  slug: string
  name: string
  price_cents: number
  currency: string
  status: string
}

function feeSplit(amountCents: number, hasSeller: boolean) {
  // Official agents (no seller) → 100% platform revenue, 0 seller earnings.
  if (!hasSeller) return { platform: amountCents, seller: 0 }
  const platform = Math.round(amountCents * PLATFORM_FEE_RATE)
  return { platform, seller: amountCents - platform }
}

/**
 * Grant a buyer access to an agent.
 * - Free agent → record a completed purchase immediately (no Stripe).
 * - Paid agent → create a Stripe Checkout session and a pending purchase.
 * Returns { free } or { url } for the client to act on.
 */
export async function createAgentCheckout(params: {
  agentId: string
  buyerId: string
  buyerEmail: string
  origin: string
}): Promise<{ free: true } | { url: string } | { error: string; status: number }> {
  const { agentId, buyerId, buyerEmail, origin } = params

  const { data: agent } = await admin
    .from('marketplace_agents')
    .select('id, seller_id, slug, name, price_cents, currency, status')
    .eq('id', agentId)
    .single<AgentRow>()

  if (!agent || agent.status !== 'listed') {
    return { error: 'Agent not found or not for sale', status: 404 }
  }
  if (agent.seller_id === buyerId) {
    return { error: 'You cannot buy your own agent', status: 400 }
  }

  // Already owned?
  const { data: existing } = await admin
    .from('agent_purchases')
    .select('id')
    .eq('agent_id', agentId)
    .eq('buyer_id', buyerId)
    .eq('status', 'completed')
    .maybeSingle()
  if (existing) return { error: 'You already own this agent', status: 409 }

  const hasSeller = !!agent.seller_id

  // ── Free agent → instant grant ──
  if (agent.price_cents === 0) {
    await admin.from('agent_purchases').insert({
      agent_id: agent.id,
      buyer_id: buyerId,
      seller_id: agent.seller_id,
      amount_cents: 0,
      platform_fee_cents: 0,
      seller_earnings_cents: 0,
      currency: agent.currency,
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    await admin.rpc('increment_agent_sales', { agent_uuid: agent.id })
    return { free: true }
  }

  // ── Paid agent → Stripe Checkout ──
  const { platform, seller } = feeSplit(agent.price_cents, hasSeller)

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: buyerEmail,
    line_items: [
      {
        price_data: {
          currency: agent.currency,
          unit_amount: agent.price_cents,
          product_data: {
            name: agent.name,
            description: 'TaskPilot agent — one-time purchase',
          },
        },
        quantity: 1,
      },
    ],
    success_url: `${origin}/marketplace/${agent.slug}?purchased=1`,
    cancel_url: `${origin}/marketplace/${agent.slug}?canceled=1`,
    metadata: {
      type: 'agent_purchase',
      agent_id: agent.id,
      buyer_id: buyerId,
    },
  })

  if (!session.url) return { error: 'Failed to start checkout', status: 500 }

  await admin.from('agent_purchases').insert({
    agent_id: agent.id,
    buyer_id: buyerId,
    seller_id: agent.seller_id,
    amount_cents: agent.price_cents,
    platform_fee_cents: platform,
    seller_earnings_cents: seller,
    currency: agent.currency,
    stripe_session_id: session.id,
    status: 'pending',
  })

  return { url: session.url }
}

/**
 * Called from the Stripe webhook on checkout.session.completed when
 * metadata.type === 'agent_purchase'. Marks the pending purchase
 * completed (idempotent) and bumps the agent's sales counter.
 */
export async function fulfillAgentPurchase(session: Stripe.Checkout.Session): Promise<void> {
  const agentId = session.metadata?.agent_id
  if (!agentId) return

  const { data: purchase } = await admin
    .from('agent_purchases')
    .select('id, agent_id, status')
    .eq('stripe_session_id', session.id)
    .maybeSingle()

  if (!purchase || purchase.status === 'completed') return // idempotent

  await admin
    .from('agent_purchases')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', purchase.id)

  await admin.rpc('increment_agent_sales', { agent_uuid: purchase.agent_id })
}
