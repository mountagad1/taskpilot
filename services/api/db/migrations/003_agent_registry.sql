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
