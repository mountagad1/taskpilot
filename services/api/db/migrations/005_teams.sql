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
