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
