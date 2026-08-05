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
