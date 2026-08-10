-- ============================================================
-- TaskPilot — complete schema
--
-- Every migration concatenated in order, for pasting into the
-- Supabase SQL editor in one go. Generated from migrations/;
-- edit those files, not this one.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 001_initial_schema.sql
-- ────────────────────────────────────────────────────────────

-- ============================================================
-- TASKPILOT — SUPABASE DATABASE SCHEMA
-- supabase/migrations/001_initial_schema.sql
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─── ENUMS ────────────────────────────────────────────────────

CREATE TYPE plan_type AS ENUM ('free', 'pro', 'enterprise');
CREATE TYPE subscription_status AS ENUM ('active', 'trialing', 'past_due', 'canceled', 'unpaid');
CREATE TYPE task_type AS ENUM (
  'smart_paste', 'summarize', 'translate', 'extract_data',
  'extract_emails', 'extract_prices', 'extract_companies', 'extract_links',
  'rewrite_text', 'generate_reply', 'autofill_form',
  'export_csv', 'export_excel', 'export_pdf',
  'push_to_hubspot', 'push_to_salesforce', 'push_to_notion', 'push_to_airtable',
  'browser_action', 'custom_prompt'
);
CREATE TYPE integration_provider AS ENUM (
  'hubspot', 'salesforce', 'notion', 'airtable', 'gmail', 'outlook'
);
CREATE TYPE export_format AS ENUM ('csv', 'excel', 'pdf', 'json', 'word');

-- ─── USERS & AUTH ─────────────────────────────────────────────

CREATE TABLE profiles (
  id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                 TEXT NOT NULL UNIQUE,
  name                  TEXT,
  avatar_url            TEXT,
  plan                  plan_type NOT NULL DEFAULT 'free',
  stripe_customer_id    TEXT UNIQUE,
  timezone              TEXT DEFAULT 'UTC',
  language              TEXT DEFAULT 'en',
  onboarded             BOOLEAN DEFAULT FALSE,
  referral_code         TEXT UNIQUE DEFAULT encode(gen_random_bytes(6), 'hex'),
  referred_by           UUID REFERENCES profiles(id),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_settings (
  user_id                     UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  theme                       TEXT DEFAULT 'dark',
  sidebar_position            TEXT DEFAULT 'right',
  shortcuts_enabled           BOOLEAN DEFAULT TRUE,
  notifications_enabled       BOOLEAN DEFAULT TRUE,
  analytics_enabled           BOOLEAN DEFAULT TRUE,
  smart_paste_confidence_min  NUMERIC DEFAULT 0.6,
  ai_model_preference         TEXT DEFAULT 'gpt-4.1-mini',
  saved_prompts               JSONB DEFAULT '[]',
  updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ANONYMOUS SESSIONS ───────────────────────────────────────

CREATE TABLE anonymous_sessions (
  session_id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fingerprint     TEXT NOT NULL,
  ip_hash         TEXT,
  user_agent      TEXT,
  actions_used    INT DEFAULT 0,
  actions_limit   INT DEFAULT 10,
  expires_at      TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  converted_to    UUID REFERENCES profiles(id) -- when user signs up
);

CREATE INDEX idx_anon_sessions_fingerprint ON anonymous_sessions(fingerprint);
CREATE INDEX idx_anon_sessions_expires ON anonymous_sessions(expires_at);

-- ─── SUBSCRIPTIONS & BILLING ─────────────────────────────────

CREATE TABLE subscriptions (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_subscription_id    TEXT UNIQUE,
  stripe_price_id           TEXT,
  plan                      plan_type NOT NULL,
  status                    subscription_status NOT NULL DEFAULT 'active',
  current_period_start      TIMESTAMPTZ,
  current_period_end        TIMESTAMPTZ,
  cancel_at_period_end      BOOLEAN DEFAULT FALSE,
  trial_end                 TIMESTAMPTZ,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe ON subscriptions(stripe_subscription_id);

CREATE TABLE billing_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES profiles(id),
  stripe_event_id TEXT UNIQUE NOT NULL,
  event_type      TEXT NOT NULL,
  amount          INT, -- cents
  currency        TEXT,
  metadata        JSONB DEFAULT '{}',
  processed_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── USAGE TRACKING ───────────────────────────────────────────

CREATE TABLE usage_periods (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  period_start        TIMESTAMPTZ NOT NULL,
  period_end          TIMESTAMPTZ NOT NULL,
  ai_actions_used     INT DEFAULT 0,
  exports_used        INT DEFAULT 0,
  automations_used    INT DEFAULT 0,
  tokens_used         INT DEFAULT 0,
  cost_usd            NUMERIC(10, 6) DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_usage_period_user ON usage_periods(user_id, period_start);

-- ─── AI REQUESTS & RESPONSES ──────────────────────────────────

CREATE TABLE ai_requests (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID REFERENCES profiles(id),
  session_id          UUID REFERENCES anonymous_sessions(session_id),
  task_type           task_type NOT NULL,
  input               TEXT,
  url                 TEXT,
  domain              TEXT,
  model_used          TEXT,
  prompt_tokens       INT DEFAULT 0,
  completion_tokens   INT DEFAULT 0,
  total_tokens        INT DEFAULT 0,
  cost_usd            NUMERIC(10, 6) DEFAULT 0,
  execution_time_ms   INT,
  cached              BOOLEAN DEFAULT FALSE,
  success             BOOLEAN DEFAULT TRUE,
  error_message       TEXT,
  confidence          NUMERIC(3, 2),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_requests_user ON ai_requests(user_id);
CREATE INDEX idx_ai_requests_domain ON ai_requests(domain);
CREATE INDEX idx_ai_requests_task ON ai_requests(task_type);
CREATE INDEX idx_ai_requests_created ON ai_requests(created_at DESC);

-- ─── WORKFLOWS ────────────────────────────────────────────────

CREATE TABLE workflows (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  trigger_type    TEXT NOT NULL DEFAULT 'manual',
  trigger_config  JSONB DEFAULT '{}',
  steps           JSONB NOT NULL DEFAULT '[]',
  is_active       BOOLEAN DEFAULT TRUE,
  run_count       INT DEFAULT 0,
  last_run_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE workflow_runs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id     UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(id),
  status          TEXT NOT NULL DEFAULT 'running', -- running, completed, failed
  steps_completed INT DEFAULT 0,
  steps_total     INT DEFAULT 0,
  result          JSONB,
  error           TEXT,
  duration_ms     INT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

-- ─── INTEGRATIONS ─────────────────────────────────────────────

CREATE TABLE integrations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider        integration_provider NOT NULL,
  access_token    TEXT NOT NULL, -- encrypted at rest
  refresh_token   TEXT,
  workspace_id    TEXT,
  workspace_name  TEXT,
  expires_at      TIMESTAMPTZ,
  metadata        JSONB DEFAULT '{}',
  connected_at    TIMESTAMPTZ DEFAULT NOW(),
  last_used_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_integrations_user_provider ON integrations(user_id, provider);

-- ─── PRODUCTIVITY METRICS ─────────────────────────────────────

CREATE TABLE productivity_metrics (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                 UUID REFERENCES profiles(id) ON DELETE CASCADE,
  session_id              UUID REFERENCES anonymous_sessions(session_id),
  date                    DATE NOT NULL DEFAULT CURRENT_DATE,
  hours_saved             NUMERIC(5, 2) DEFAULT 0,
  actions_completed       INT DEFAULT 0,
  keystrokes_saved        INT DEFAULT 0,
  forms_autofilled        INT DEFAULT 0,
  data_rows_extracted     INT DEFAULT 0,
  exports_created         INT DEFAULT 0,
  streak_days             INT DEFAULT 0
);

CREATE UNIQUE INDEX idx_metrics_user_date ON productivity_metrics(user_id, date);

-- ─── ANALYTICS EVENTS ─────────────────────────────────────────

CREATE TABLE analytics_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES profiles(id),
  session_id      TEXT,
  event_name      TEXT NOT NULL,
  properties      JSONB DEFAULT '{}',
  url             TEXT,
  domain          TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_analytics_user ON analytics_events(user_id);
CREATE INDEX idx_analytics_event ON analytics_events(event_name);
CREATE INDEX idx_analytics_created ON analytics_events(created_at DESC);

-- ─── REFERRALS ────────────────────────────────────────────────

CREATE TABLE referrals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referrer_id     UUID NOT NULL REFERENCES profiles(id),
  referred_id     UUID NOT NULL REFERENCES profiles(id),
  status          TEXT DEFAULT 'pending', -- pending, converted, rewarded
  reward_given    BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── SAVED PROMPTS ────────────────────────────────────────────

-- user_id NULL = a built-in template shipped with the product and readable
-- by everyone. Anything owned by a user is private to that user.
CREATE TABLE saved_prompts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES profiles(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  prompt      TEXT NOT NULL,
  category    TEXT,
  icon        TEXT,
  use_count   INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_saved_prompts_user ON saved_prompts(user_id);

-- ─── AI RESPONSE CACHE (semantic) ────────────────────────────

CREATE TABLE response_cache (
  cache_key       TEXT PRIMARY KEY,
  response        JSONB NOT NULL,
  task_type       task_type,
  hit_count       INT DEFAULT 0,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cache_expires ON response_cache(expires_at);

-- ─── UPDATED_AT TRIGGERS ──────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_subscriptions_updated BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE productivity_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_prompts ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Settings
CREATE POLICY "Users own settings" ON user_settings
  FOR ALL USING (auth.uid() = user_id);

-- Subscriptions
CREATE POLICY "Users can view own subscriptions" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Usage
CREATE POLICY "Users can view own usage" ON usage_periods
  FOR SELECT USING (auth.uid() = user_id);

-- AI Requests
CREATE POLICY "Users can view own requests" ON ai_requests
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service can insert requests" ON ai_requests
  FOR INSERT WITH CHECK (true);

-- Workflows
CREATE POLICY "Users own workflows" ON workflows
  FOR ALL USING (auth.uid() = user_id);

-- Integrations
CREATE POLICY "Users own integrations" ON integrations
  FOR ALL USING (auth.uid() = user_id);

-- Productivity
CREATE POLICY "Users own metrics" ON productivity_metrics
  FOR ALL USING (auth.uid() = user_id);

-- Saved Prompts — own prompts are read/write; built-in templates (user_id
-- NULL) are readable by everyone but writable by no one through the API.
CREATE POLICY "Users own prompts" ON saved_prompts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Built-in prompts are readable" ON saved_prompts
  FOR SELECT USING (user_id IS NULL);

-- ─── PROFILE AUTO-CREATE ──────────────────────────────────────

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  INSERT INTO user_settings (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── USAGE RESET (monthly) ────────────────────────────────────

CREATE OR REPLACE FUNCTION reset_monthly_usage()
RETURNS VOID AS $$
BEGIN
  -- Called by cron job on billing period reset
  UPDATE usage_periods
  SET ai_actions_used = 0, exports_used = 0, automations_used = 0
  WHERE period_end < NOW();
END;
$$ LANGUAGE plpgsql;

-- ─── ANALYTICS VIEWS ──────────────────────────────────────────

CREATE VIEW v_daily_stats AS
SELECT
  DATE(created_at) AS date,
  COUNT(DISTINCT user_id) AS dau,
  COUNT(*) AS total_actions,
  SUM(total_tokens) AS total_tokens,
  SUM(cost_usd) AS total_cost_usd,
  AVG(execution_time_ms) AS avg_response_ms,
  COUNT(*) FILTER (WHERE cached = TRUE) AS cache_hits,
  task_type
FROM ai_requests
WHERE created_at > NOW() - INTERVAL '90 days'
GROUP BY DATE(created_at), task_type;

CREATE VIEW v_user_ltv AS
SELECT
  p.id,
  p.email,
  p.plan,
  p.created_at,
  COALESCE(SUM(ar.cost_usd), 0) AS total_ai_cost,
  COUNT(ar.id) AS total_actions,
  MAX(ar.created_at) AS last_active
FROM profiles p
LEFT JOIN ai_requests ar ON ar.user_id = p.id
GROUP BY p.id, p.email, p.plan, p.created_at;

-- ─── SEED DATA ────────────────────────────────────────────────

-- Built-in prompt templates. user_id stays NULL: there is no system row in
-- `profiles` to point at, and inventing one would fail the foreign key.
INSERT INTO saved_prompts (user_id, title, prompt, category, icon)
SELECT
  NULL::UUID,
  title, prompt, category, icon
FROM (VALUES
  ('Summarize page', 'Summarize this webpage in 3 bullet points', 'productivity', '📝'),
  ('Extract contacts', 'Extract all contact information from this page', 'extraction', '👤'),
  ('Professional reply', 'Write a professional reply to this email', 'writing', '✉️'),
  ('Export to CSV', 'Export all table data to CSV', 'export', '📊'),
  ('Translate to English', 'Translate this page to English', 'language', '🌐'),
  ('Find prices', 'Extract all prices and products from this page', 'extraction', '💰')
) AS t(title, prompt, category, icon);


-- ────────────────────────────────────────────────────────────
-- 002_marketplace.sql
-- ────────────────────────────────────────────────────────────

-- ============================================================
-- TASKPILOT — AGENT MARKETPLACE
-- supabase/migrations/002_marketplace.sql
-- Listings, gated manifests, purchases with 10% platform fee
-- ============================================================

-- ─── LISTINGS ─────────────────────────────────────────────────
-- seller_id NULL = official TaskPilot agent.

CREATE TABLE marketplace_agents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id       UUID REFERENCES profiles(id) ON DELETE CASCADE,
  slug            TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  tagline         TEXT,
  description     TEXT,
  category        TEXT NOT NULL DEFAULT 'automation',
  capabilities    JSONB NOT NULL DEFAULT '[]',
  price_cents     INT NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  currency        TEXT NOT NULL DEFAULT 'usd',
  status          TEXT NOT NULL DEFAULT 'draft', -- draft | listed | suspended
  version         TEXT NOT NULL DEFAULT '1.0.0',
  sales_count     INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_marketplace_agents_status ON marketplace_agents(status);
CREATE INDEX idx_marketplace_agents_seller ON marketplace_agents(seller_id);
CREATE INDEX idx_marketplace_agents_category ON marketplace_agents(category);

-- ─── MANIFESTS (the deliverable — gated until purchased) ─────

CREATE TABLE agent_manifests (
  agent_id        UUID PRIMARY KEY REFERENCES marketplace_agents(id) ON DELETE CASCADE,
  manifest        JSONB NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PURCHASES ────────────────────────────────────────────────
-- TaskPilot is the intermediary: platform_fee_cents is 10% of the
-- sale, seller_earnings_cents is the remaining 90% (ledgered here;
-- payouts to sellers are settled from this ledger).

CREATE TABLE agent_purchases (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id              UUID NOT NULL REFERENCES marketplace_agents(id) ON DELETE CASCADE,
  buyer_id              UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  seller_id             UUID REFERENCES profiles(id) ON DELETE SET NULL,
  amount_cents          INT NOT NULL CHECK (amount_cents >= 0),
  platform_fee_cents    INT NOT NULL DEFAULT 0,
  seller_earnings_cents INT NOT NULL DEFAULT 0,
  currency              TEXT NOT NULL DEFAULT 'usd',
  stripe_session_id     TEXT UNIQUE,
  status                TEXT NOT NULL DEFAULT 'pending', -- pending | completed | refunded
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  completed_at          TIMESTAMPTZ
);

CREATE INDEX idx_agent_purchases_buyer ON agent_purchases(buyer_id);
CREATE INDEX idx_agent_purchases_seller ON agent_purchases(seller_id);
CREATE INDEX idx_agent_purchases_agent ON agent_purchases(agent_id);

-- A buyer owns an agent at most once.
CREATE UNIQUE INDEX idx_agent_purchases_unique_completed
  ON agent_purchases(agent_id, buyer_id) WHERE status = 'completed';

-- ─── SALES COUNTER (called from the Stripe webhook) ──────────

CREATE OR REPLACE FUNCTION increment_agent_sales(agent_uuid UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE marketplace_agents
  SET sales_count = sales_count + 1, updated_at = NOW()
  WHERE id = agent_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── UPDATED_AT TRIGGERS ─────────────────────────────────────

CREATE TRIGGER trg_marketplace_agents_updated BEFORE UPDATE ON marketplace_agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_agent_manifests_updated BEFORE UPDATE ON agent_manifests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────

ALTER TABLE marketplace_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_purchases ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can browse listed agents; sellers see their own drafts.
CREATE POLICY "Listed agents are public" ON marketplace_agents
  FOR SELECT USING (status = 'listed' OR auth.uid() = seller_id);

CREATE POLICY "Sellers create listings" ON marketplace_agents
  FOR INSERT WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "Sellers manage own listings" ON marketplace_agents
  FOR UPDATE USING (auth.uid() = seller_id);

CREATE POLICY "Sellers delete own listings" ON marketplace_agents
  FOR DELETE USING (auth.uid() = seller_id);

-- Manifest is the product: only the seller, or a buyer with a completed
-- purchase, can read it. Purchases are inserted server-side only.
CREATE POLICY "Manifest visible to seller or buyer" ON agent_manifests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM marketplace_agents a
      WHERE a.id = agent_manifests.agent_id AND a.seller_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM agent_purchases p
      WHERE p.agent_id = agent_manifests.agent_id
        AND p.buyer_id = auth.uid()
        AND p.status = 'completed'
    )
  );

CREATE POLICY "Sellers write own manifests" ON agent_manifests
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM marketplace_agents a
      WHERE a.id = agent_manifests.agent_id AND a.seller_id = auth.uid()
    )
  );

CREATE POLICY "Sellers update own manifests" ON agent_manifests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM marketplace_agents a
      WHERE a.id = agent_manifests.agent_id AND a.seller_id = auth.uid()
    )
  );

-- Buyers and sellers can see their own transactions (writes go through
-- the service-role API route / Stripe webhook only).
CREATE POLICY "Participants see own purchases" ON agent_purchases
  FOR SELECT USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

-- ─── SEED: OFFICIAL TASKPILOT AGENTS ─────────────────────────
-- Ruflo-style "model + harness" manifests built from TaskPilot's real
-- task types (smart_paste, extract_*, generate_reply, translate,
-- summarize, meeting_notes, export_*, push_to_hubspot).

INSERT INTO marketplace_agents (slug, name, tagline, description, category, capabilities, price_cents, status) VALUES
  ('lead-capture-pro', 'Lead Capture Pro', 'LinkedIn profile → CRM contact in one keystroke',
   'Parses any LinkedIn profile or email signature on the current page and pushes a clean, deduplicated contact into HubSpot. Uses the 3-layer Smart Paste parser (regex → heuristics → AI) so most captures cost zero tokens.',
   'sales', '["smart_paste","extract_emails","push_to_hubspot"]', 1900, 'listed'),
  ('email-harvester', 'Email Harvester', 'Collect every email on the page, deduped and exportable',
   'Scans the visible page for email addresses, dedupes them, and hands you a one-click CSV export. Pure heuristics — no AI tokens spent.',
   'extraction', '["extract_emails","export_csv"]', 0, 'listed'),
  ('table-to-excel', 'Table → Excel', 'Any HTML table becomes a styled .xlsx',
   'Detects every table on the page, lets you pick one, and exports it to Excel with typed columns and auto-width. Handles paginated tables up to 100 rows per pass.',
   'extraction', '["extract_data","export_excel"]', 900, 'listed'),
  ('price-monitor', 'Price Monitor', 'Track competitor prices across any storefront',
   'Extracts product names and prices from e-commerce and listing pages into a structured sheet you can diff over time. Built for repeat runs on the same URLs.',
   'ecommerce', '["extract_prices","extract_data","export_csv"]', 2900, 'listed'),
  ('inbox-reply-copilot', 'Inbox Reply Copilot', 'Professional replies for Gmail, Outlook and LinkedIn DMs',
   'Reads the open thread and drafts a reply in your chosen tone (formal, concise, casual). You review and send — it never sends on its own.',
   'writing', '["generate_reply","rewrite_text"]', 1400, 'listed'),
  ('page-summarizer', 'Page Summarizer', 'TL;DR any article or doc in 3 bullets',
   'Summarizes the visible page into key points with a configurable length. Long pages are chunked to stay inside the per-run token budget.',
   'research', '["summarize"]', 0, 'listed'),
  ('polyglot-translator', 'Polyglot Translator', 'Inline translation to 40+ languages',
   'Translates the selection or the whole page while keeping formatting. Semantic caching means repeat translations of the same content are free.',
   'language', '["translate"]', 0, 'listed'),
  ('meeting-notes-scribe', 'Meeting Notes Scribe', 'Turn call transcripts into structured notes',
   'Paste a transcript (Meet, Zoom, Teams) and get Summary, Key Points, Action Items and Next Steps — ready to paste into Notion or an email.',
   'productivity', '["meeting_notes","summarize"]', 1200, 'listed');

INSERT INTO agent_manifests (agent_id, manifest)
SELECT id, jsonb_build_object(
  'schema', 'taskpilot.agent/v1',
  'name', name,
  'slug', slug,
  'version', version,
  'role', category,
  'description', description,
  'capabilities', capabilities,
  'harness', jsonb_build_object(
    'model', 'gpt-4.1-mini',
    'token_budget_per_run', 2000,
    'memory', jsonb_build_object('namespace', slug, 'ttl_hours', 24),
    'tools', capabilities
  ),
  'triggers', jsonb_build_array(jsonb_build_object('type', 'manual', 'surface', 'sidebar')),
  'workflow', (
    SELECT jsonb_agg(jsonb_build_object('step', ord, 'action', cap))
    FROM jsonb_array_elements_text(capabilities) WITH ORDINALITY AS t(cap, ord)
  ),
  'deploy', jsonb_build_object('targets', jsonb_build_array('extension', 'dashboard'), 'min_plan', 'free')
)
FROM marketplace_agents
WHERE seller_id IS NULL;


-- ────────────────────────────────────────────────────────────
-- 003_agent_registry.sql
-- ────────────────────────────────────────────────────────────

-- ============================================================
-- TASKPILOT — AGENT REGISTRY
-- supabase/migrations/003_agent_registry.sql
--
-- Turns the flat marketplace listing into a versioned registry:
--   marketplace_agents  the listing (one row per agent)
--   agent_versions      immutable published manifests, one flagged current
--   agent_installs      who has it, at which version, with which settings
--   agent_reviews       ratings, aggregated back onto the listing
-- ============================================================

-- ─── LISTING: OWNERSHIP, VISIBILITY, COUNTERS ────────────────

-- `seller_id` only ever meant "who owns this". Agents are now also private
-- or team-scoped, where "seller" is misleading.
ALTER TABLE marketplace_agents RENAME COLUMN seller_id TO owner_id;
ALTER INDEX idx_marketplace_agents_seller RENAME TO idx_marketplace_agents_owner;

ALTER TABLE marketplace_agents
  ADD COLUMN team_id       UUID,
  ADD COLUMN visibility    TEXT NOT NULL DEFAULT 'public',
  ADD COLUMN goal          TEXT,
  ADD COLUMN min_plan      plan_type NOT NULL DEFAULT 'free',
  ADD COLUMN install_count INT  NOT NULL DEFAULT 0,
  ADD COLUMN run_count     INT  NOT NULL DEFAULT 0,
  ADD COLUMN rating_avg    NUMERIC(3,2) NOT NULL DEFAULT 0,
  ADD COLUMN rating_count  INT  NOT NULL DEFAULT 0;

ALTER TABLE marketplace_agents
  ADD CONSTRAINT marketplace_agents_visibility_check
    CHECK (visibility IN ('private', 'team', 'public')),
  ADD CONSTRAINT marketplace_agents_status_check
    CHECK (status IN ('draft', 'listed', 'suspended', 'archived')),
  ADD CONSTRAINT marketplace_agents_rating_check
    CHECK (rating_avg >= 0 AND rating_avg <= 5);

-- A listed public agent must be free or priced; a private one is never sold.
ALTER TABLE marketplace_agents
  ADD CONSTRAINT marketplace_agents_private_not_priced
    CHECK (visibility <> 'private' OR price_cents = 0);

CREATE INDEX idx_marketplace_agents_visibility ON marketplace_agents(visibility);
CREATE INDEX idx_marketplace_agents_team ON marketplace_agents(team_id);
-- Trigram index powers the marketplace search box.
CREATE INDEX idx_marketplace_agents_name_trgm ON marketplace_agents USING gin (name gin_trgm_ops);

-- Backfill a goal for the seeded agents so the runtime has something to plan
-- against even before their manifest is re-published.
UPDATE marketplace_agents SET goal = COALESCE(tagline, name) WHERE goal IS NULL;

-- ─── VERSIONS ────────────────────────────────────────────────

CREATE TABLE agent_versions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id    UUID NOT NULL REFERENCES marketplace_agents(id) ON DELETE CASCADE,
  version     TEXT NOT NULL,
  manifest    JSONB NOT NULL,
  changelog   TEXT,
  is_current  BOOLEAN NOT NULL DEFAULT FALSE,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agent_id, version)
);

CREATE INDEX idx_agent_versions_agent ON agent_versions(agent_id);

-- Exactly one current version per agent. A partial unique index enforces
-- this far more reliably than application code that must remember to unset
-- the previous flag.
CREATE UNIQUE INDEX idx_agent_versions_one_current
  ON agent_versions(agent_id) WHERE is_current;

-- Migrate the single-manifest table into the version history.
INSERT INTO agent_versions (agent_id, version, manifest, is_current, created_at)
SELECT m.agent_id, a.version, m.manifest, TRUE, COALESCE(m.updated_at, NOW())
FROM agent_manifests m
JOIN marketplace_agents a ON a.id = m.agent_id;

DROP TABLE agent_manifests;

-- ─── INSTALLS ────────────────────────────────────────────────

CREATE TABLE agent_installs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id      UUID NOT NULL REFERENCES marketplace_agents(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  version       TEXT NOT NULL,
  settings      JSONB NOT NULL DEFAULT '{}',
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  installed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_run_at   TIMESTAMPTZ,
  UNIQUE (agent_id, user_id)
);

CREATE INDEX idx_agent_installs_user ON agent_installs(user_id);
CREATE INDEX idx_agent_installs_agent ON agent_installs(agent_id);

-- ─── REVIEWS ─────────────────────────────────────────────────

CREATE TABLE agent_reviews (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id    UUID NOT NULL REFERENCES marketplace_agents(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating      INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title       TEXT,
  body        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agent_id, user_id)
);

CREATE INDEX idx_agent_reviews_agent ON agent_reviews(agent_id);

CREATE TRIGGER trg_agent_reviews_updated BEFORE UPDATE ON agent_reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Keep the denormalised rating on the listing in step with the reviews, so
-- the marketplace grid never has to aggregate at read time.
CREATE OR REPLACE FUNCTION refresh_agent_rating()
RETURNS TRIGGER AS $$
DECLARE
  target UUID := COALESCE(NEW.agent_id, OLD.agent_id);
BEGIN
  UPDATE marketplace_agents a
  SET rating_avg   = COALESCE(stats.avg_rating, 0),
      rating_count = COALESCE(stats.total, 0)
  FROM (
    SELECT ROUND(AVG(rating)::numeric, 2) AS avg_rating, COUNT(*) AS total
    FROM agent_reviews WHERE agent_id = target
  ) AS stats
  WHERE a.id = target;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_agent_reviews_rating
  AFTER INSERT OR UPDATE OR DELETE ON agent_reviews
  FOR EACH ROW EXECUTE FUNCTION refresh_agent_rating();

-- ─── COUNTERS ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION increment_agent_installs(agent_uuid UUID)
RETURNS VOID AS $$
  UPDATE marketplace_agents
  SET install_count = install_count + 1, updated_at = NOW()
  WHERE id = agent_uuid;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_agent_runs(agent_uuid UUID)
RETURNS VOID AS $$
  UPDATE marketplace_agents
  SET run_count = run_count + 1, updated_at = NOW()
  WHERE id = agent_uuid;
$$ LANGUAGE sql SECURITY DEFINER;

-- ─── PUBLISHING ──────────────────────────────────────────────

-- Publishing is a single transactional step: insert the version, demote the
-- previous current one, and move the listing's version pointer. Doing this
-- from the application would leave a window where two versions are current
-- or none is.
CREATE OR REPLACE FUNCTION publish_agent_version(
  agent_uuid   UUID,
  new_version  TEXT,
  new_manifest JSONB,
  note         TEXT DEFAULT NULL,
  author       UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  version_id UUID;
BEGIN
  UPDATE agent_versions SET is_current = FALSE
  WHERE agent_id = agent_uuid AND is_current;

  INSERT INTO agent_versions (agent_id, version, manifest, changelog, is_current, created_by)
  VALUES (agent_uuid, new_version, new_manifest, note, TRUE, author)
  ON CONFLICT (agent_id, version)
  DO UPDATE SET manifest = EXCLUDED.manifest,
                changelog = EXCLUDED.changelog,
                is_current = TRUE
  RETURNING id INTO version_id;

  UPDATE marketplace_agents
  SET version = new_version, updated_at = NOW()
  WHERE id = agent_uuid;

  RETURN version_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────

ALTER TABLE agent_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_installs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_reviews  ENABLE ROW LEVEL SECURITY;

-- The listing policies predate visibility; replace them.
DROP POLICY IF EXISTS "Listed agents are public" ON marketplace_agents;
DROP POLICY IF EXISTS "Sellers create listings" ON marketplace_agents;
DROP POLICY IF EXISTS "Sellers manage own listings" ON marketplace_agents;
DROP POLICY IF EXISTS "Sellers delete own listings" ON marketplace_agents;

CREATE POLICY "Agents are visible to owner or audience" ON marketplace_agents
  FOR SELECT USING (
    (status = 'listed' AND visibility = 'public')
    OR owner_id = auth.uid()
  );

CREATE POLICY "Owners create agents" ON marketplace_agents
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners update agents" ON marketplace_agents
  FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners delete agents" ON marketplace_agents
  FOR DELETE USING (owner_id = auth.uid());

-- The manifest is the product. Readable by the owner, or by anyone who has
-- a completed purchase or an install of the agent.
CREATE POLICY "Versions visible to owner or entitled user" ON agent_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM marketplace_agents a
      WHERE a.id = agent_versions.agent_id AND a.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM agent_purchases p
      WHERE p.agent_id = agent_versions.agent_id
        AND p.buyer_id = auth.uid()
        AND p.status = 'completed'
    )
    OR EXISTS (
      SELECT 1 FROM agent_installs i
      WHERE i.agent_id = agent_versions.agent_id AND i.user_id = auth.uid()
    )
  );

CREATE POLICY "Owners write versions" ON agent_versions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM marketplace_agents a
      WHERE a.id = agent_versions.agent_id AND a.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users manage own installs" ON agent_installs
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Reviews are public to read; only the author may write their own.
CREATE POLICY "Reviews are public" ON agent_reviews
  FOR SELECT USING (true);

CREATE POLICY "Users write own reviews" ON agent_reviews
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own reviews" ON agent_reviews
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own reviews" ON agent_reviews
  FOR DELETE USING (user_id = auth.uid());


-- ────────────────────────────────────────────────────────────
-- 004_runtime.sql
-- ────────────────────────────────────────────────────────────

-- ============================================================
-- TASKPILOT — RUN HISTORY
-- supabase/migrations/004_runtime.sql
--
-- Every agent execution is recorded: the plan it ran, each step's outcome,
-- and any files it produced. This is what powers the run timeline, the
-- analytics page, cost attribution and support debugging.
-- ============================================================

CREATE TYPE run_status AS ENUM (
  'queued', 'planning', 'running', 'awaiting_confirmation',
  'completed', 'failed', 'cancelled', 'timed_out'
);

CREATE TYPE run_step_status AS ENUM (
  'pending', 'running', 'succeeded', 'failed', 'skipped'
);

-- ─── RUNS ────────────────────────────────────────────────────

CREATE TABLE agent_runs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES profiles(id) ON DELETE CASCADE,
  session_id      UUID REFERENCES anonymous_sessions(session_id) ON DELETE SET NULL,
  agent_id        UUID REFERENCES marketplace_agents(id) ON DELETE SET NULL,
  workflow_id     UUID REFERENCES workflows(id) ON DELETE SET NULL,
  team_id         UUID,

  goal            TEXT NOT NULL,
  status          run_status NOT NULL DEFAULT 'queued',
  -- The full ActionPlan as executed. Kept verbatim so a run stays
  -- reproducible even after the agent publishes a new version.
  plan            JSONB,
  source_url      TEXT,
  domain          TEXT,

  steps_total     INT NOT NULL DEFAULT 0,
  steps_completed INT NOT NULL DEFAULT 0,
  output          JSONB NOT NULL DEFAULT '{}',
  error           TEXT,

  tokens_used     INT NOT NULL DEFAULT 0,
  cost_usd        NUMERIC(10,6) NOT NULL DEFAULT 0,

  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ,
  duration_ms     INT,

  CONSTRAINT agent_runs_owner_present CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
);

CREATE INDEX idx_agent_runs_user ON agent_runs(user_id, started_at DESC);
CREATE INDEX idx_agent_runs_agent ON agent_runs(agent_id);
CREATE INDEX idx_agent_runs_workflow ON agent_runs(workflow_id);
CREATE INDEX idx_agent_runs_status ON agent_runs(status);
CREATE INDEX idx_agent_runs_started ON agent_runs(started_at DESC);

-- ─── STEPS ───────────────────────────────────────────────────

CREATE TABLE agent_run_steps (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id       UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  step_index   INT NOT NULL,
  step_id      TEXT NOT NULL,
  action       TEXT NOT NULL,
  status       run_step_status NOT NULL DEFAULT 'pending',
  -- Truncated by the writer: a step that scrapes a large table should not
  -- put the whole table in the timeline row.
  result       JSONB,
  error        TEXT,
  attempts     INT NOT NULL DEFAULT 1,
  duration_ms  INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, step_index)
);

CREATE INDEX idx_run_steps_run ON agent_run_steps(run_id, step_index);

-- Keep the run's progress counters in step with its steps, so the runs list
-- never needs a correlated subquery.
CREATE OR REPLACE FUNCTION refresh_run_progress()
RETURNS TRIGGER AS $$
DECLARE
  target UUID := COALESCE(NEW.run_id, OLD.run_id);
BEGIN
  UPDATE agent_runs r
  SET steps_total = stats.total,
      steps_completed = stats.done
  FROM (
    SELECT COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status IN ('succeeded', 'skipped')) AS done
    FROM agent_run_steps WHERE run_id = target
  ) AS stats
  WHERE r.id = target;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_run_steps_progress
  AFTER INSERT OR UPDATE OR DELETE ON agent_run_steps
  FOR EACH ROW EXECUTE FUNCTION refresh_run_progress();

-- Stamp duration when a run reaches a terminal state, rather than trusting
-- each caller to compute it.
CREATE OR REPLACE FUNCTION stamp_run_completion()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('completed', 'failed', 'cancelled', 'timed_out')
     AND OLD.status NOT IN ('completed', 'failed', 'cancelled', 'timed_out') THEN
    NEW.finished_at := COALESCE(NEW.finished_at, NOW());
    NEW.duration_ms := COALESCE(
      NEW.duration_ms,
      GREATEST(0, (EXTRACT(EPOCH FROM (NEW.finished_at - NEW.started_at)) * 1000)::INT)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_agent_runs_completion
  BEFORE UPDATE ON agent_runs
  FOR EACH ROW EXECUTE FUNCTION stamp_run_completion();

-- ─── ARTIFACTS / FILES ───────────────────────────────────────

CREATE TYPE file_kind AS ENUM ('upload', 'export', 'screenshot', 'artifact');

CREATE TABLE stored_files (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID REFERENCES profiles(id) ON DELETE CASCADE,
  run_id        UUID REFERENCES agent_runs(id) ON DELETE CASCADE,
  kind          file_kind NOT NULL DEFAULT 'artifact',
  filename      TEXT NOT NULL,
  content_type  TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes    BIGINT NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  -- Object-storage key, never a public URL. URLs are signed on demand so a
  -- leaked row can't be turned into a permanent download link.
  storage_path  TEXT NOT NULL,
  checksum      TEXT,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stored_files_user ON stored_files(user_id, created_at DESC);
CREATE INDEX idx_stored_files_run ON stored_files(run_id);
CREATE INDEX idx_stored_files_expiry ON stored_files(expires_at) WHERE expires_at IS NOT NULL;

-- ─── ANALYTICS VIEWS ─────────────────────────────────────────

CREATE VIEW v_run_daily_stats AS
SELECT
  user_id,
  DATE(started_at)                                    AS date,
  COUNT(*)                                            AS runs,
  COUNT(*) FILTER (WHERE status = 'completed')        AS completed,
  COUNT(*) FILTER (WHERE status = 'failed')           AS failed,
  SUM(tokens_used)                                    AS tokens,
  SUM(cost_usd)                                       AS cost_usd,
  AVG(duration_ms) FILTER (WHERE duration_ms IS NOT NULL) AS avg_duration_ms
FROM agent_runs
GROUP BY user_id, DATE(started_at);

CREATE VIEW v_agent_performance AS
SELECT
  a.id                                                 AS agent_id,
  a.slug,
  a.name,
  COUNT(r.id)                                          AS total_runs,
  COUNT(r.id) FILTER (WHERE r.status = 'completed')    AS successful_runs,
  -- NULLIF avoids a divide-by-zero for an agent that has never run.
  ROUND(
    COUNT(r.id) FILTER (WHERE r.status = 'completed')::numeric
      / NULLIF(COUNT(r.id), 0) * 100, 1
  )                                                    AS success_rate,
  AVG(r.duration_ms)                                   AS avg_duration_ms,
  SUM(r.cost_usd)                                      AS total_cost_usd
FROM marketplace_agents a
LEFT JOIN agent_runs r ON r.agent_id = a.id
GROUP BY a.id, a.slug, a.name;

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────

ALTER TABLE agent_runs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE stored_files    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own runs" ON agent_runs
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users write own runs" ON agent_runs
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own runs" ON agent_runs
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own runs" ON agent_runs
  FOR DELETE USING (user_id = auth.uid());

-- Steps inherit their run's visibility.
CREATE POLICY "Steps follow run access" ON agent_run_steps
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM agent_runs r WHERE r.id = agent_run_steps.run_id AND r.user_id = auth.uid())
  );

CREATE POLICY "Users own files" ON stored_files
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());


-- ────────────────────────────────────────────────────────────
-- 005_teams.sql
-- ────────────────────────────────────────────────────────────

-- ============================================================
-- TASKPILOT — TEAMS & AGENT SHARING
-- supabase/migrations/005_teams.sql
--
-- Teams let a workspace share agents and workflows. The membership helpers
-- below are SECURITY DEFINER on purpose: a policy on `team_members` that
-- queries `team_members` recurses infinitely, and Postgres will abort the
-- query rather than resolve it. Routing the lookup through a definer
-- function breaks that cycle.
-- ============================================================

CREATE TYPE team_role AS ENUM ('owner', 'admin', 'member', 'viewer');

-- ─── TEAMS ───────────────────────────────────────────────────

CREATE TABLE teams (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  owner_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan        plan_type NOT NULL DEFAULT 'free',
  seats       INT NOT NULL DEFAULT 5 CHECK (seats > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_teams_updated BEFORE UPDATE ON teams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE team_members (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id    UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role       team_role NOT NULL DEFAULT 'member',
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, user_id)
);

CREATE INDEX idx_team_members_user ON team_members(user_id);
CREATE INDEX idx_team_members_team ON team_members(team_id);

CREATE TABLE team_invites (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role        team_role NOT NULL DEFAULT 'member',
  -- Random, single-use, and the only thing that proves the invite is genuine.
  token       TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  invited_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_team_invites_email ON team_invites(lower(email));
CREATE UNIQUE INDEX idx_team_invites_pending
  ON team_invites(team_id, lower(email)) WHERE accepted_at IS NULL;

-- ─── MEMBERSHIP HELPERS ──────────────────────────────────────

CREATE OR REPLACE FUNCTION is_team_member(team_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = team_uuid AND user_id = user_uuid
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION team_role_of(team_uuid UUID, user_uuid UUID)
RETURNS team_role AS $$
  SELECT role FROM team_members
  WHERE team_id = team_uuid AND user_id = user_uuid;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION can_manage_team(team_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT team_role_of(team_uuid, user_uuid) IN ('owner', 'admin');
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- The creator is always the first member; forgetting this in application
-- code would lock the owner out of their own team via RLS.
CREATE OR REPLACE FUNCTION add_team_owner()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO team_members (team_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner')
  ON CONFLICT (team_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_teams_add_owner
  AFTER INSERT ON teams
  FOR EACH ROW EXECUTE FUNCTION add_team_owner();

-- Refuse to admit more members than the plan has seats for.
CREATE OR REPLACE FUNCTION enforce_team_seats()
RETURNS TRIGGER AS $$
DECLARE
  seat_limit INT;
  used INT;
BEGIN
  SELECT seats INTO seat_limit FROM teams WHERE id = NEW.team_id;
  SELECT COUNT(*) INTO used FROM team_members WHERE team_id = NEW.team_id;

  IF used >= seat_limit THEN
    RAISE EXCEPTION 'Team % has no seats left (limit %)', NEW.team_id, seat_limit
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_team_members_seats
  BEFORE INSERT ON team_members
  FOR EACH ROW EXECUTE FUNCTION enforce_team_seats();

-- ─── SHARING ─────────────────────────────────────────────────

CREATE TABLE agent_shares (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id    UUID NOT NULL REFERENCES marketplace_agents(id) ON DELETE CASCADE,
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  shared_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  can_edit    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agent_id, team_id)
);

CREATE INDEX idx_agent_shares_team ON agent_shares(team_id);

-- Now that teams exist, wire up the foreign keys left dangling in 003/004.
ALTER TABLE marketplace_agents
  ADD CONSTRAINT marketplace_agents_team_fk
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;

ALTER TABLE agent_runs
  ADD CONSTRAINT agent_runs_team_fk
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;

-- Team-visible agents become readable by that team's members.
CREATE POLICY "Team agents visible to members" ON marketplace_agents
  FOR SELECT USING (
    (visibility = 'team' AND team_id IS NOT NULL AND is_team_member(team_id, auth.uid()))
    OR EXISTS (
      SELECT 1 FROM agent_shares s
      WHERE s.agent_id = marketplace_agents.id AND is_team_member(s.team_id, auth.uid())
    )
  );

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────

ALTER TABLE teams         ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_invites  ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_shares  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members see their teams" ON teams
  FOR SELECT USING (is_team_member(id, auth.uid()));

CREATE POLICY "Users create teams they own" ON teams
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Admins update their team" ON teams
  FOR UPDATE USING (can_manage_team(id, auth.uid()))
  WITH CHECK (can_manage_team(id, auth.uid()));

-- Deleting a team is destructive and cascades; owners only, not admins.
CREATE POLICY "Owners delete their team" ON teams
  FOR DELETE USING (owner_id = auth.uid());

CREATE POLICY "Members see the roster" ON team_members
  FOR SELECT USING (is_team_member(team_id, auth.uid()));

CREATE POLICY "Admins manage the roster" ON team_members
  FOR INSERT WITH CHECK (can_manage_team(team_id, auth.uid()));

CREATE POLICY "Admins change roles" ON team_members
  FOR UPDATE USING (can_manage_team(team_id, auth.uid()))
  WITH CHECK (can_manage_team(team_id, auth.uid()));

-- An admin can remove others; anyone can remove themselves.
CREATE POLICY "Admins remove members or members leave" ON team_members
  FOR DELETE USING (can_manage_team(team_id, auth.uid()) OR user_id = auth.uid());

CREATE POLICY "Admins manage invites" ON team_invites
  FOR ALL USING (can_manage_team(team_id, auth.uid()))
  WITH CHECK (can_manage_team(team_id, auth.uid()));

CREATE POLICY "Members see shares" ON agent_shares
  FOR SELECT USING (is_team_member(team_id, auth.uid()));

CREATE POLICY "Agent owners share into their teams" ON agent_shares
  FOR INSERT WITH CHECK (
    is_team_member(team_id, auth.uid())
    AND EXISTS (
      SELECT 1 FROM marketplace_agents a
      WHERE a.id = agent_shares.agent_id AND a.owner_id = auth.uid()
    )
  );

CREATE POLICY "Agent owners revoke shares" ON agent_shares
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM marketplace_agents a
      WHERE a.id = agent_shares.agent_id AND a.owner_id = auth.uid()
    )
    OR can_manage_team(team_id, auth.uid())
  );


-- ────────────────────────────────────────────────────────────
-- 006_platform.sql
-- ────────────────────────────────────────────────────────────

-- ============================================================
-- TASKPILOT — PLATFORM SERVICES
-- supabase/migrations/006_platform.sql
--
-- Notification service, developer API keys, and the background job queue
-- that backs scheduled workflows, exports and notification delivery.
-- ============================================================

-- ─── NOTIFICATIONS ───────────────────────────────────────────

CREATE TYPE notification_type AS ENUM (
  'run_completed', 'run_failed', 'agent_published', 'agent_purchased',
  'agent_installed', 'agent_review', 'team_invite', 'usage_limit',
  'subscription', 'system'
);

CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type        notification_type NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT,
  link        TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}',
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
-- Partial index: the unread badge is the hottest query and only ever looks
-- at unread rows, which are a small fraction of the table.
CREATE INDEX idx_notifications_unread
  ON notifications(user_id) WHERE read_at IS NULL;

CREATE TABLE notification_preferences (
  user_id     UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  channels    JSONB NOT NULL DEFAULT '{}',
  digest      TEXT NOT NULL DEFAULT 'off' CHECK (digest IN ('off', 'daily', 'weekly')),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION notify_user(
  target_user UUID,
  kind        notification_type,
  subject     TEXT,
  message     TEXT DEFAULT NULL,
  deep_link   TEXT DEFAULT NULL,
  extra       JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
  INSERT INTO notifications (user_id, type, title, body, link, metadata)
  VALUES (target_user, kind, subject, message, deep_link, extra)
  RETURNING id;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION mark_notifications_read(target_user UUID)
RETURNS INT AS $$
DECLARE
  affected INT;
BEGIN
  UPDATE notifications SET read_at = NOW()
  WHERE user_id = target_user AND read_at IS NULL;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── DEVELOPER API KEYS ──────────────────────────────────────

CREATE TABLE api_keys (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_id       UUID REFERENCES teams(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  -- Shown in the UI so a developer can tell two keys apart.
  key_prefix    TEXT NOT NULL,
  -- SHA-256 of the full key. The plaintext is returned exactly once, at
  -- creation, and is not recoverable from this table.
  key_hash      TEXT UNIQUE NOT NULL,
  scopes        TEXT[] NOT NULL DEFAULT '{}',
  last_used_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_keys_user ON api_keys(user_id);
-- Auth looks a key up by hash on every request; only live keys can match.
CREATE INDEX idx_api_keys_hash_live
  ON api_keys(key_hash) WHERE revoked_at IS NULL;

CREATE TABLE api_key_usage (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  api_key_id  UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL,
  method      TEXT NOT NULL,
  status_code INT NOT NULL,
  duration_ms INT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_key_usage_key ON api_key_usage(api_key_id, created_at DESC);

-- ─── JOB QUEUE ───────────────────────────────────────────────

CREATE TYPE job_type AS ENUM (
  'run_agent', 'scheduled_workflow', 'export_generate',
  'notification_dispatch', 'usage_rollup', 'cache_sweep'
);

CREATE TYPE job_status AS ENUM ('queued', 'processing', 'succeeded', 'failed', 'dead');

CREATE TABLE job_queue (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type          job_type NOT NULL,
  payload       JSONB NOT NULL DEFAULT '{}',
  status        job_status NOT NULL DEFAULT 'queued',
  priority      INT NOT NULL DEFAULT 0,
  attempts      INT NOT NULL DEFAULT 0,
  max_attempts  INT NOT NULL DEFAULT 5,
  -- Not eligible before this instant. Powers both scheduling and backoff.
  run_after     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at     TIMESTAMPTZ,
  locked_by     TEXT,
  last_error    TEXT,
  -- Set by the enqueuer to make retries and duplicate submissions idempotent.
  dedupe_key    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Claim order: priority first, then oldest eligible.
CREATE INDEX idx_job_queue_claimable
  ON job_queue(priority DESC, run_after) WHERE status = 'queued';
CREATE UNIQUE INDEX idx_job_queue_dedupe
  ON job_queue(dedupe_key) WHERE dedupe_key IS NOT NULL AND status IN ('queued', 'processing');

CREATE TRIGGER trg_job_queue_updated BEFORE UPDATE ON job_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Atomically hand a batch of jobs to one worker. SKIP LOCKED is what lets
-- several workers poll concurrently without handing the same job to two of
-- them or blocking on each other's locks.
CREATE OR REPLACE FUNCTION claim_jobs(worker TEXT, batch_size INT DEFAULT 5)
RETURNS SETOF job_queue AS $$
  -- The ORDER BY inside the sub-select decides *which* rows are claimed, but
  -- UPDATE ... RETURNING emits them in whatever order it updated. Re-sorting
  -- the CTE output is what makes the worker actually process high priority
  -- work first.
  WITH claimed AS (
    UPDATE job_queue
    SET status = 'processing',
        locked_at = NOW(),
        locked_by = worker,
        attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM job_queue
      WHERE status = 'queued' AND run_after <= NOW()
      ORDER BY priority DESC, run_after
      FOR UPDATE SKIP LOCKED
      LIMIT batch_size
    )
    RETURNING *
  )
  SELECT * FROM claimed ORDER BY priority DESC, run_after;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION complete_job(job_id UUID)
RETURNS VOID AS $$
  UPDATE job_queue
  SET status = 'succeeded', locked_at = NULL, locked_by = NULL, last_error = NULL
  WHERE id = job_id;
$$ LANGUAGE sql;

-- Requeue with exponential backoff until the attempt budget runs out, then
-- park the job as 'dead' so it stops consuming worker capacity.
CREATE OR REPLACE FUNCTION fail_job(job_id UUID, reason TEXT)
RETURNS VOID AS $$
  UPDATE job_queue
  SET status = CASE WHEN attempts >= max_attempts THEN 'dead'::job_status ELSE 'queued'::job_status END,
      run_after = NOW() + (LEAST(POWER(2, attempts)::INT, 3600) || ' seconds')::INTERVAL,
      locked_at = NULL,
      locked_by = NULL,
      last_error = reason
  WHERE id = job_id;
$$ LANGUAGE sql;

-- A worker that dies mid-job leaves the row locked forever; sweep those back
-- into the queue so the work isn't silently lost.
CREATE OR REPLACE FUNCTION requeue_stalled_jobs(stall_minutes INT DEFAULT 15)
RETURNS INT AS $$
DECLARE
  affected INT;
BEGIN
  UPDATE job_queue
  SET status = 'queued', locked_at = NULL, locked_by = NULL,
      last_error = COALESCE(last_error, 'worker stalled')
  WHERE status = 'processing'
    AND locked_at < NOW() - (stall_minutes || ' minutes')::INTERVAL;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$ LANGUAGE plpgsql;

-- ─── SCHEDULED WORKFLOWS ─────────────────────────────────────

ALTER TABLE workflows
  ADD COLUMN team_id       UUID REFERENCES teams(id) ON DELETE SET NULL,
  ADD COLUMN agent_id      UUID REFERENCES marketplace_agents(id) ON DELETE SET NULL,
  ADD COLUMN schedule_cron TEXT,
  ADD COLUMN next_run_at   TIMESTAMPTZ;

CREATE INDEX idx_workflows_due
  ON workflows(next_run_at) WHERE is_active AND next_run_at IS NOT NULL;

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────

ALTER TABLE notifications             ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences  ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_key_usage             ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_queue                 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notifications" ON notifications
  FOR SELECT USING (user_id = auth.uid());

-- Users may mark their own notifications read, but never create one: that
-- would let a client fabricate "payment received" style messages.
CREATE POLICY "Users update own notifications" ON notifications
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own notifications" ON notifications
  FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "Users own notification preferences" ON notification_preferences
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Keys are listed and revoked by their owner; the hash is never selectable
-- through the API layer, which projects specific columns.
CREATE POLICY "Users read own api keys" ON api_keys
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users revoke own api keys" ON api_keys
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own api keys" ON api_keys
  FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "Users read own key usage" ON api_key_usage
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM api_keys k WHERE k.id = api_key_usage.api_key_id AND k.user_id = auth.uid())
  );

-- No policies on job_queue: RLS is enabled and nothing is granted, so only
-- the service role (which bypasses RLS) can touch it. Workers run there.


-- ────────────────────────────────────────────────────────────
-- 007_oauth.sql
-- ────────────────────────────────────────────────────────────

-- ============================================================
-- TASKPILOT — OAUTH INTEGRATIONS
-- services/api/db/migrations/007_oauth.sql
--
-- Adds the state the authorization-code flow needs, and the columns that
-- make a stored token usable: what it may do (scopes), when it dies
-- (expires_at already existed), and whether the last refresh worked.
--
-- 001 created `integrations` with a comment claiming tokens were
-- "encrypted at rest" while nothing performed encryption. That is now
-- true: the API writes AES-256-GCM ciphertext, and `token_encrypted`
-- records which rows have been migrated so a legacy plaintext row is
-- detectable rather than silently mistaken for ciphertext.
-- ============================================================

-- ─── AUTHORIZATION-CODE STATE ─────────────────────────────────

-- One row per in-flight authorization. The `state` parameter is the CSRF
-- defence: it is generated here, echoed by the provider, and must match a
-- row that has not expired and has not already been consumed. Without this
-- an attacker can replay their own callback and bind their account to the
-- victim's session.
CREATE TABLE IF NOT EXISTS oauth_states (
  state         TEXT PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider      integration_provider NOT NULL,
  -- Echoed back to the token endpoint. OAuth requires the redirect_uri at
  -- exchange time to match the one used at authorize time exactly, so it
  -- has to be remembered rather than recomputed.
  redirect_uri  TEXT NOT NULL,
  -- PKCE verifier. HubSpot does not support PKCE (it is a confidential
  -- client using client_secret), so this is null for HubSpot and present
  -- for providers added later that do support it.
  code_verifier TEXT,
  -- Where to send the browser once the exchange finishes.
  return_to     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,
  -- Set when the state is redeemed. A second callback carrying the same
  -- state must fail, so an intercepted URL cannot be replayed.
  consumed_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_user ON oauth_states(user_id, provider);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expiry ON oauth_states(expires_at);

-- ─── INTEGRATION COLUMNS ──────────────────────────────────────

-- What the user actually granted. Requesting a scope does not guarantee
-- receiving it, so a push must check what was granted rather than what was
-- asked for, and report a missing scope as a clear error.
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS scopes TEXT[] NOT NULL DEFAULT '{}';

-- Marks rows whose access_token/refresh_token hold ciphertext.
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS token_encrypted BOOLEAN NOT NULL DEFAULT FALSE;

-- Refresh bookkeeping. A provider can revoke a grant at any time — the user
-- may uninstall the app from their side — and the first sign is a refresh
-- that fails. Recording it lets the dashboard say "reconnect required"
-- instead of failing every run with an opaque 401.
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS last_refreshed_at TIMESTAMPTZ;
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS refresh_error TEXT;

-- ─── EXPIRED-STATE CLEANUP ────────────────────────────────────

-- Authorization states are short-lived and abandoned flows are normal (the
-- user closes the tab at the provider's consent screen). Without a sweep
-- the table grows without bound.
CREATE OR REPLACE FUNCTION purge_expired_oauth_states()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  removed INTEGER;
BEGIN
  DELETE FROM oauth_states
  WHERE expires_at < NOW() - INTERVAL '1 hour';
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

-- ─── ROW-LEVEL SECURITY ───────────────────────────────────────

ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;

-- Deliberately no policy granting SELECT to end users. An in-flight state
-- is a bearer value: anyone holding it can complete the bound flow. Only
-- the service role touches this table, and the service role bypasses RLS.
-- Enabling RLS with no permissive policy denies every ordinary role, which
-- is the intent.

-- `integrations` already carries "Users own integrations" from 001. Tokens
-- must never reach the browser, so restrict the columns a user-facing
-- client could read via a view rather than widening the table policy.
--
-- `security_invoker` is not optional here. A view runs with its OWNER's
-- rights by default, which means it does NOT consult the querying user's
-- RLS on the underlying table — and PostgREST exposes everything in
-- `public`, so without this any authenticated user could read every
-- tenant's connections by selecting from the view. Invoker rights make the
-- existing "Users own integrations" policy apply to reads through it.
--
-- Requires PostgreSQL 15+. Supabase is well past that.
CREATE OR REPLACE VIEW integration_connections
WITH (security_invoker = true) AS
SELECT
  id,
  user_id,
  provider,
  workspace_id,
  workspace_name,
  scopes,
  expires_at,
  connected_at,
  last_used_at,
  last_refreshed_at,
  (refresh_error IS NOT NULL) AS needs_reconnect
FROM integrations;
