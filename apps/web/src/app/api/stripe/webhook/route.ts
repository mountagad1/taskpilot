import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import Stripe from 'stripe'
import { handleWebhookEvent } from '@/lib/stripe'

export const runtime = 'nodejs'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
})

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = headers().get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook verification failed'
    console.error('[Stripe Webhook] Verification failed:', message)
    return NextResponse.json({ error: message }, { status: 400 })
  }

  try {
    await handleWebhookEvent(body, signature)
    return NextResponse.json({ received: true, type: event.type })
  } catch (err) {
    console.error(`[Stripe Webhook] Handler error for ${event.type}:`, err)
    // Return 200 to prevent Stripe from retrying for non-critical errors
    return NextResponse.json(
      { received: true, warning: 'Handler error logged' },
      { status: 200 }
    )
  }
}
