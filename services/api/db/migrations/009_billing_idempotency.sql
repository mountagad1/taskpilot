-- ============================================================
-- TASKPILOT — BILLING STATUS COVERAGE & WEBHOOK IDEMPOTENCY
-- services/api/db/migrations/009_billing_idempotency.sql
--
-- 1. subscription_status was created (001) with only five of Stripe's eight
--    subscription statuses. The webhook stores whatever status Stripe
--    reports, so an `incomplete` (first payment awaiting 3DS),
--    `incomplete_expired` or `paused` subscription failed the upsert and the
--    event errored on every retry. Add the missing values.
--
-- 2. Webhook idempotency relies on billing_events.stripe_event_id being
--    UNIQUE: the handler claims the event id before processing and treats a
--    unique violation as "already processed". 001 declares the constraint;
--    the self-check below aborts if it is ever dropped, because the handler
--    would then silently process redeliveries twice.
--
-- Adds no tables, so 008's "RLS on every table" invariant is unaffected.
-- Safe to re-run: ADD VALUE IF NOT EXISTS is idempotent.
-- ============================================================

ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'incomplete';
ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'incomplete_expired';
ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'paused';

-- ─── SELF-CHECK ──────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
     WHERE i.indrelid = 'public.billing_events'::regclass
       AND i.indisunique
       AND i.indnatts = 1
       AND a.attname = 'stripe_event_id'
  ) THEN
    RAISE EXCEPTION 'billing_events.stripe_event_id must be UNIQUE: webhook idempotency depends on it';
  END IF;
END $$;
