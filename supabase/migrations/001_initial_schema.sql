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

CREATE TABLE saved_prompts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  prompt      TEXT NOT NULL,
  category    TEXT,
  icon        TEXT,
  use_count   INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

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

-- Saved Prompts
CREATE POLICY "Users own prompts" ON saved_prompts
  FOR ALL USING (auth.uid() = user_id);

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

-- Default saved prompts (available to all users)
INSERT INTO saved_prompts (user_id, title, prompt, category, icon)
SELECT 
  '00000000-0000-0000-0000-000000000000'::UUID, -- system user
  title, prompt, category, icon
FROM (VALUES
  ('Summarize page', 'Summarize this webpage in 3 bullet points', 'productivity', '📝'),
  ('Extract contacts', 'Extract all contact information from this page', 'extraction', '👤'),
  ('Professional reply', 'Write a professional reply to this email', 'writing', '✉️'),
  ('Export to CSV', 'Export all table data to CSV', 'export', '📊'),
  ('Translate to English', 'Translate this page to English', 'language', '🌐'),
  ('Find prices', 'Extract all prices and products from this page', 'extraction', '💰')
) AS t(title, prompt, category, icon);
