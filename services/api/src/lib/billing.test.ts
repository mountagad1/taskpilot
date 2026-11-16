// ============================================================
// TASKPILOT API — BILLING TESTS
// services/api/src/lib/billing.test.ts
//
// Drives the real Hono app and the real billing/marketplace code against an
// in-memory Supabase and a fake Stripe client. The fake Stripe holds the
// "current" state of each subscription, which is what the webhook re-fetches,
// so out-of-order delivery can be exercised exactly as it happens in prod.
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { randomBytes } from 'node:crypto'

import { resetRateLimits } from './security'
import { hashApiKey } from './keys'

// ─── IN-MEMORY SUPABASE ──────────────────────────────────────

type Row = Record<string, any>
const tables: Record<string, Row[]> = {}
const rpcCalls: Array<{ fn: string; args: Row }> = []

/** Unique constraints the code relies on (mirrors the migrations). */
const UNIQUE: Record<string, string[]> = {
  billing_events: ['stripe_event_id'],
  subscriptions: ['stripe_subscription_id'],
}

const USER_ID = '11111111-1111-4111-8111-111111111111'
const SESSION_TOKEN = 'session-token-for-billing-tests'
const API_KEY = 'tp_live_billingtestkey000000000000000000000000'

function from(table: string) {
  tables[table] ??= []
  const filters: Array<(r: Row) => boolean> = []
  let mode: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select'
  let payload: Row | null = null
  let conflictKeys: string[] = []

  const run = (): { data: any; error: any } => {
    const rows = tables[table]

    if (mode === 'insert') {
      for (const key of UNIQUE[table] ?? []) {
        if (rows.some((r) => r[key] === payload![key])) {
          return { data: null, error: { code: '23505', message: `duplicate key value violates unique constraint (${key})` } }
        }
      }
      const row = { id: randomBytes(8).toString('hex'), ...payload }
      rows.push(row)
      return { data: [row], error: null }
    }

    if (mode === 'upsert') {
      const existing = rows.find((r) => conflictKeys.every((k) => r[k] === payload![k]))
      if (existing) Object.assign(existing, payload)
      else rows.push({ id: randomBytes(8).toString('hex'), ...payload })
      return { data: [payload], error: null }
    }

    const hit = rows.filter((r) => filters.every((f) => f(r)))

    if (mode === 'update') {
      hit.forEach((r) => Object.assign(r, payload))
      return { data: hit, error: null }
    }
    if (mode === 'delete') {
      for (const r of hit) rows.splice(rows.indexOf(r), 1)
      return { data: hit, error: null }
    }
    return { data: hit, error: null }
  }

  const builder: any = {
    select: () => builder,
    insert(values: Row) {
      mode = 'insert'
      payload = values
      return builder
    },
    update(values: Row) {
      mode = 'update'
      payload = values
      return builder
    },
    upsert(values: Row, options?: { onConflict?: string }) {
      mode = 'upsert'
      payload = values
      conflictKeys = (options?.onConflict ?? '').split(',').map((s) => s.trim()).filter(Boolean)
      return builder
    },
    delete() {
      mode = 'delete'
      return builder
    },
    eq(column: string, value: any) {
      filters.push((r) => r[column] === value)
      return builder
    },
    in(column: string, values: any[]) {
      filters.push((r) => values.includes(r[column]))
      return builder
    },
    limit() {
      return builder
    },
    maybeSingle() {
      const { data, error } = run()
      return Promise.resolve({ data: Array.isArray(data) ? (data[0] ?? null) : data, error })
    },
    single() {
      return builder.maybeSingle()
    },
    then(resolve: (v: any) => void, reject?: (e: any) => void) {
      try {
        resolve(run())
      } catch (e) {
        reject?.(e)
      }
    },
  }
  return builder
}

const fakeAdmin = {
  from,
  rpc: (fn: string, args: Row) => {
    rpcCalls.push({ fn, args })
    return Promise.resolve({ data: null, error: null })
  },
  auth: {
    getUser: (token: string) =>
      Promise.resolve(
        token === SESSION_TOKEN
          ? { data: { user: { id: USER_ID, email: 'buyer@acme.test' } }, error: null }
          : { data: { user: null }, error: { message: 'invalid token' } }
      ),
  },
}

// ─── FAKE STRIPE ─────────────────────────────────────────────

const VALID_SIGNATURE = 'valid-signature'

/** Stripe's CURRENT view of each subscription — what retrieve() returns. */
const stripeSubscriptions: Record<string, Row> = {}
let retrieveFailure: Error | null = null

const fakeStripe = {
  webhooks: {
    constructEvent: (body: string, signature: string, secret: string) => {
      if (signature !== VALID_SIGNATURE || secret !== 'whsec_test') throw new Error('No signatures found')
      return JSON.parse(body)
    },
  },
  subscriptions: {
    retrieve: vi.fn(async (id: string) => {
      if (retrieveFailure) {
        const err = retrieveFailure
        retrieveFailure = null
        throw err
      }
      const sub = stripeSubscriptions[id]
      if (!sub) throw Object.assign(new Error(`No such subscription: ${id}`), { code: 'resource_missing' })
      return structuredClone(sub)
    }),
  },
  customers: {
    create: vi.fn(async () => ({ id: 'cus_new' })),
  },
  checkout: {
    sessions: {
      create: vi.fn(async (params: Row) => ({ id: `cs_${randomBytes(4).toString('hex')}`, url: 'https://checkout.stripe.test/s', params })),
    },
  },
  billingPortal: {
    sessions: {
      create: vi.fn(async () => ({ url: 'https://billing.stripe.test/p' })),
    },
  },
}

vi.mock('./clients', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./clients')>()
  return {
    ...actual,
    getAdminClient: () => fakeAdmin,
    getStripe: () => fakeStripe,
    hasSupabaseCredentials: () => true,
    hasStripeCredentials: () => true,
  }
})

// Imported after the mock is registered.
const { entitlementForStatus, planForPrice } = await import('./billing')
const { createApp } = await import('../app')
const app = createApp()

// ─── HELPERS ─────────────────────────────────────────────────

const call = (path: string, init?: RequestInit) => app.request(new Request(`http://api.test${path}`, init))

const withAuth = (token: string) => (path: string, init: RequestInit = {}) =>
  call(path, {
    method: 'POST',
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
const asSession = withAuth(SESSION_TOKEN)
const asApiKey = withAuth(API_KEY)

let eventSeq = 0
function makeEvent(type: string, object: Row, created = Math.floor(Date.now() / 1000)) {
  return { id: `evt_${++eventSeq}`, type, created, data: { object } }
}

function deliver(event: Row, signature = VALID_SIGNATURE) {
  return call('/v1/billing/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': signature, 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  })
}

function subscription(id: string, status: string, price = 'price_pro_m'): Row {
  return {
    id,
    object: 'subscription',
    customer: 'cus_123',
    status,
    metadata: { supabase_user_id: USER_ID },
    items: { data: [{ price: { id: price } }] },
    current_period_start: 1_700_000_000,
    current_period_end: 1_702_592_000,
    cancel_at_period_end: false,
    trial_end: null,
  }
}

const profile = () => tables.profiles.find((p) => p.id === USER_ID)!

beforeEach(async () => {
  resetRateLimits()
  for (const key of Object.keys(tables)) delete tables[key]
  for (const key of Object.keys(stripeSubscriptions)) delete stripeSubscriptions[key]
  rpcCalls.length = 0
  retrieveFailure = null
  vi.clearAllMocks()

  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
  process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_pro_m'
  process.env.STRIPE_PRICE_PRO_ANNUAL = 'price_pro_y'
  process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY = 'price_ent_m'
  process.env.PUBLIC_APP_URL = 'https://app.taskpilot.test/'

  tables.profiles = [{ id: USER_ID, email: 'buyer@acme.test', plan: 'free', stripe_customer_id: 'cus_123' }]
  tables.api_keys = [
    { id: 'key_1', user_id: USER_ID, key_hash: await hashApiKey(API_KEY), scopes: ['runs:read'], expires_at: null, revoked_at: null },
  ]
})

// ─── STATUS → PLAN ───────────────────────────────────────────

describe('subscription status → entitlement', () => {
  it.each([
    ['active', 'grant'],
    ['trialing', 'grant'],
    ['past_due', 'grant'],
    ['unpaid', 'revoke'],
    ['canceled', 'revoke'],
    ['incomplete_expired', 'revoke'],
    ['paused', 'revoke'],
    ['incomplete', 'none'],
    ['some_future_status', 'none'],
  ])('%s → %s', (status, expected) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(entitlementForStatus(status)).toBe(expected)
  })

  it.each([
    ['trialing', 'free', 'pro'],
    ['past_due', 'pro', 'pro'],
    ['active', 'free', 'pro'],
    ['canceled', 'pro', 'free'],
    ['unpaid', 'pro', 'free'],
    ['incomplete', 'free', 'free'],
  ])('a %s subscription takes a %s user to %s', async (status, before, after) => {
    profile().plan = before
    stripeSubscriptions.sub_1 = subscription('sub_1', status)

    const response = await deliver(makeEvent('customer.subscription.updated', stripeSubscriptions.sub_1))

    expect(response.status).toBe(200)
    expect(profile().plan).toBe(after)
    expect(tables.subscriptions.find((s) => s.stripe_subscription_id === 'sub_1')?.status).toBe(status)
  })

  it('maps the enterprise price to enterprise', async () => {
    stripeSubscriptions.sub_e = subscription('sub_e', 'active', 'price_ent_m')
    await deliver(makeEvent('customer.subscription.created', stripeSubscriptions.sub_e))
    expect(profile().plan).toBe('enterprise')
  })
})

// ─── UNKNOWN PRICES ──────────────────────────────────────────

describe('unknown price ids', () => {
  it('maps only configured prices', () => {
    expect(planForPrice('price_pro_m')).toBe('pro')
    expect(planForPrice('price_pro_y')).toBe('pro')
    expect(planForPrice('price_ent_m')).toBe('enterprise')
    expect(planForPrice('price_someone_elses')).toBeNull()
    expect(planForPrice('')).toBeNull()
    expect(planForPrice(undefined)).toBeNull()
  })

  it('does not match an unset price env var', () => {
    delete process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY
    expect(planForPrice('')).toBeNull()
    expect(planForPrice('price_ent_m')).toBeNull()
  })

  it('does not grant pro for an active subscription on an unknown price', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    stripeSubscriptions.sub_x = subscription('sub_x', 'active', 'price_unknown')

    const response = await deliver(makeEvent('customer.subscription.created', stripeSubscriptions.sub_x))

    expect(response.status).toBe(200)
    expect(profile().plan).toBe('free')
    expect(tables.subscriptions[0].plan).toBe('free')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('price_unknown'))
  })

  it('leaves an existing plan unchanged when the price is unknown', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    profile().plan = 'enterprise'
    stripeSubscriptions.sub_x = subscription('sub_x', 'active', 'price_unknown')

    await deliver(makeEvent('customer.subscription.updated', stripeSubscriptions.sub_x))

    expect(profile().plan).toBe('enterprise')
  })
})

// ─── IDEMPOTENCY & ORDERING ──────────────────────────────────

describe('webhook idempotency', () => {
  it('processes a redelivered event once', async () => {
    stripeSubscriptions.sub_1 = subscription('sub_1', 'active')
    const event = makeEvent('customer.subscription.created', stripeSubscriptions.sub_1)

    const first = await deliver(event)
    const second = await deliver(event)

    expect(first.status).toBe(200)
    expect((await first.json()).data.duplicate).toBe(false)
    expect(second.status).toBe(200)
    expect((await second.json()).data.duplicate).toBe(true)
    expect(fakeStripe.subscriptions.retrieve).toHaveBeenCalledTimes(1)
    expect(tables.billing_events.filter((e) => e.stripe_event_id === event.id)).toHaveLength(1)
  })

  it('counts a redelivered agent purchase once', async () => {
    tables.agent_purchases = [{ id: 'pur_1', agent_id: 'agent_1', status: 'pending', stripe_session_id: 'cs_paid' }]
    const event = makeEvent('checkout.session.completed', {
      id: 'cs_paid',
      payment_status: 'paid',
      metadata: { type: 'agent_purchase', agent_id: 'agent_1', buyer_id: USER_ID },
    })

    await deliver(event)
    await deliver(event)

    expect(rpcCalls).toEqual([{ fn: 'increment_agent_sales', args: { agent_uuid: 'agent_1' } }])
  })

  it('releases the claim when processing fails so Stripe can retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    stripeSubscriptions.sub_1 = subscription('sub_1', 'active')
    const event = makeEvent('customer.subscription.created', stripeSubscriptions.sub_1)
    retrieveFailure = new Error('Stripe API unavailable')

    const failed = await deliver(event)
    expect(failed.status).toBe(500)
    expect(tables.billing_events).toHaveLength(0)
    expect(profile().plan).toBe('free')

    const retried = await deliver(event)
    expect(retried.status).toBe(200)
    expect((await retried.json()).data.duplicate).toBe(false)
    expect(profile().plan).toBe('pro')
  })

  it('rejects a bad signature with 400 and records nothing', async () => {
    const response = await deliver(makeEvent('customer.subscription.created', subscription('sub_1', 'active')), 'forged')
    expect(response.status).toBe(400)
    expect(tables.billing_events ?? []).toHaveLength(0)
  })
})

describe('webhook ordering', () => {
  it('does not let a late subscription.updated re-grant a cancelled plan', async () => {
    profile().plan = 'pro'
    const t0 = 1_700_000_000
    const lateActive = makeEvent('customer.subscription.updated', subscription('sub_1', 'active'), t0)
    // Stripe's current state: the subscription has since been cancelled.
    stripeSubscriptions.sub_1 = subscription('sub_1', 'canceled')
    const deleted = makeEvent('customer.subscription.deleted', stripeSubscriptions.sub_1, t0 + 60)

    // Delivered newest-first.
    expect((await deliver(deleted)).status).toBe(200)
    expect(profile().plan).toBe('free')
    expect((await deliver(lateActive)).status).toBe(200)

    expect(profile().plan).toBe('free')
    expect(tables.subscriptions[0].status).toBe('canceled')
  })

  it('falls back to the deleted payload when Stripe no longer has the subscription', async () => {
    profile().plan = 'pro'
    const response = await deliver(makeEvent('customer.subscription.deleted', subscription('sub_gone', 'canceled')))
    expect(response.status).toBe(200)
    expect(profile().plan).toBe('free')
  })

  it('keeps the plan from another live subscription when one is cancelled', async () => {
    tables.subscriptions = [{ user_id: USER_ID, stripe_subscription_id: 'sub_other', plan: 'pro', status: 'active' }]
    profile().plan = 'pro'
    stripeSubscriptions.sub_1 = subscription('sub_1', 'canceled')

    await deliver(makeEvent('customer.subscription.deleted', stripeSubscriptions.sub_1))

    expect(profile().plan).toBe('pro')
  })
})

// ─── MARKETPLACE FULFILMENT ──────────────────────────────────

describe('agent purchase fulfilment', () => {
  const sessionEvent = (paymentStatus: string, type = 'checkout.session.completed') =>
    makeEvent(type, {
      id: 'cs_1',
      payment_status: paymentStatus,
      metadata: { type: 'agent_purchase', agent_id: 'agent_1', buyer_id: USER_ID },
    })

  beforeEach(() => {
    tables.agent_purchases = [{ id: 'pur_1', agent_id: 'agent_1', status: 'pending', stripe_session_id: 'cs_1' }]
  })

  it('does not fulfil a completed but unpaid checkout', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const response = await deliver(sessionEvent('unpaid'))

    expect(response.status).toBe(200)
    expect(tables.agent_purchases[0].status).toBe('pending')
    expect(rpcCalls).toHaveLength(0)
  })

  it('fulfils once the async payment succeeds', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await deliver(sessionEvent('unpaid'))
    await deliver(sessionEvent('paid', 'checkout.session.async_payment_succeeded'))

    expect(tables.agent_purchases[0].status).toBe('completed')
    expect(rpcCalls).toHaveLength(1)
  })

  it.each(['paid', 'no_payment_required'])('fulfils a %s checkout', async (status) => {
    await deliver(sessionEvent(status))
    expect(tables.agent_purchases[0].status).toBe('completed')
    expect(rpcCalls).toHaveLength(1)
  })
})

// ─── SUBSCRIBE / PORTAL / CHECKOUT ROUTES ────────────────────

describe('POST /v1/billing/subscribe', () => {
  const subscribe = (fn: typeof asSession, body: Row, headers: Record<string, string> = {}) =>
    fn('/v1/billing/subscribe', { body: JSON.stringify(body), headers })

  it('requires authentication', async () => {
    const response = await call('/v1/billing/subscribe', { method: 'POST', body: JSON.stringify({ plan: 'pro' }) })
    expect(response.status).toBe(401)
  })

  it('refuses API keys', async () => {
    const response = await subscribe(asApiKey, { plan: 'pro' })
    expect(response.status).toBe(403)
    expect(fakeStripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('returns a Checkout URL whose redirects use PUBLIC_APP_URL, never the Origin header', async () => {
    const response = await subscribe(asSession, { plan: 'pro', interval: 'annual' }, { Origin: 'https://evil.example' })

    expect(response.status).toBe(200)
    expect((await response.json()).data).toEqual({ url: 'https://checkout.stripe.test/s' })

    const params = fakeStripe.checkout.sessions.create.mock.calls[0][0] as Row
    expect(params.line_items).toEqual([{ price: 'price_pro_y', quantity: 1 }])
    expect(params.customer).toBe('cus_123')
    expect(params.success_url).toBe(
      'https://app.taskpilot.test/dashboard/settings?billing=success&session_id={CHECKOUT_SESSION_ID}'
    )
    expect(params.cancel_url).toBe('https://app.taskpilot.test/dashboard/settings?billing=canceled')
    expect(JSON.stringify(params)).not.toContain('evil.example')
  })

  it('creates and links a Stripe customer on first subscribe', async () => {
    profile().stripe_customer_id = null
    const response = await subscribe(asSession, { plan: 'pro' })

    expect(response.status).toBe(200)
    expect(fakeStripe.customers.create).toHaveBeenCalledTimes(1)
    expect(profile().stripe_customer_id).toBe('cus_new')
  })

  it('validates the plan and interval', async () => {
    expect((await subscribe(asSession, { plan: 'free' })).status).toBe(400)
    expect((await subscribe(asSession, { plan: 'pro', interval: 'weekly' })).status).toBe(400)
    expect((await subscribe(asSession, { plan: 'enterprise', interval: 'annual' })).status).toBe(400)
  })

  it('reports an unconfigured price as not configured', async () => {
    delete process.env.STRIPE_PRICE_PRO_ANNUAL
    expect((await subscribe(asSession, { plan: 'pro', interval: 'annual' })).status).toBe(503)
  })

  it('gives a first-time Pro subscriber a 3-day trial', async () => {
    delete process.env.STRIPE_PRO_TRIAL_DAYS
    expect((await subscribe(asSession, { plan: 'pro' })).status).toBe(200)
    const params = fakeStripe.checkout.sessions.create.mock.calls[0][0] as Row
    expect((params.subscription_data as Row).trial_period_days).toBe(3)
  })

  it('gives no second trial after a canceled subscription', async () => {
    tables.subscriptions = [{ user_id: USER_ID, stripe_subscription_id: 'sub_old', plan: 'pro', status: 'canceled' }]
    expect((await subscribe(asSession, { plan: 'pro' })).status).toBe(200)
    const params = fakeStripe.checkout.sessions.create.mock.calls[0][0] as Row
    expect(params.subscription_data).not.toHaveProperty('trial_period_days')
  })

  it('gives Enterprise no trial', async () => {
    expect((await subscribe(asSession, { plan: 'enterprise' })).status).toBe(200)
    const params = fakeStripe.checkout.sessions.create.mock.calls[0][0] as Row
    expect(params.subscription_data).not.toHaveProperty('trial_period_days')
  })

  it('lets STRIPE_PRO_TRIAL_DAYS change or turn off the trial', async () => {
    process.env.STRIPE_PRO_TRIAL_DAYS = '7'
    await subscribe(asSession, { plan: 'pro' })
    expect((fakeStripe.checkout.sessions.create.mock.calls[0][0].subscription_data as Row).trial_period_days).toBe(7)

    process.env.STRIPE_PRO_TRIAL_DAYS = '0'
    await subscribe(asSession, { plan: 'pro' })
    expect(fakeStripe.checkout.sessions.create.mock.calls[1][0].subscription_data).not.toHaveProperty('trial_period_days')
    delete process.env.STRIPE_PRO_TRIAL_DAYS
  })

  it('refuses a second subscription while one is live', async () => {
    tables.subscriptions = [{ user_id: USER_ID, stripe_subscription_id: 'sub_1', plan: 'pro', status: 'trialing' }]
    const response = await subscribe(asSession, { plan: 'pro' })
    expect(response.status).toBe(409)
    expect(fakeStripe.checkout.sessions.create).not.toHaveBeenCalled()
  })
})

describe('POST /v1/billing/portal', () => {
  it('requires authentication', async () => {
    expect((await call('/v1/billing/portal', { method: 'POST' })).status).toBe(401)
  })

  it('refuses API keys', async () => {
    expect((await asApiKey('/v1/billing/portal')).status).toBe(403)
    expect(fakeStripe.billingPortal.sessions.create).not.toHaveBeenCalled()
  })

  it('returns a portal URL that returns to PUBLIC_APP_URL', async () => {
    const response = await asSession('/v1/billing/portal', { headers: { Origin: 'https://evil.example' } })

    expect(response.status).toBe(200)
    expect((await response.json()).data).toEqual({ url: 'https://billing.stripe.test/p' })
    expect(fakeStripe.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: 'cus_123',
      return_url: 'https://app.taskpilot.test/dashboard/settings',
    })
  })

  it('404s for a user who has never subscribed', async () => {
    profile().stripe_customer_id = null
    expect((await asSession('/v1/billing/portal')).status).toBe(404)
  })
})

describe('POST /v1/billing/checkout (agent purchase)', () => {
  it('builds success/cancel URLs from PUBLIC_APP_URL, not the Origin header', async () => {
    tables.marketplace_agents = [
      { id: 'agent_1', owner_id: null, slug: 'lead-finder', name: 'Lead Finder', price_cents: 1900, currency: 'usd', status: 'listed' },
    ]

    const response = await asSession('/v1/billing/checkout', {
      body: JSON.stringify({ agentId: 'agent_1' }),
      headers: { Origin: 'https://evil.example' },
    })

    expect(response.status).toBe(200)
    const params = fakeStripe.checkout.sessions.create.mock.calls[0][0] as Row
    expect(params.success_url).toBe('https://app.taskpilot.test/marketplace/lead-finder?purchased=1')
    expect(params.cancel_url).toBe('https://app.taskpilot.test/marketplace/lead-finder?canceled=1')
  })
})
