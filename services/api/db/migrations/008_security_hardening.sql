-- ============================================================
-- TASKPILOT — SECURITY HARDENING
-- services/api/db/migrations/008_security_hardening.sql
--
-- The API talks to Postgres exclusively through the service-role client,
-- which bypasses RLS. Grants and policies therefore only matter for direct
-- PostgREST access with the public anon key or a user's own JWT (roles
-- `anon` and `authenticated`) — but that path is open to anyone who signs
-- up, so it has to be as tight as the API itself.
--
-- Supabase grants ALL on every new table, view and function in `public` to
-- anon, authenticated and service_role (default privileges), and Postgres
-- additionally grants EXECUTE on every function to PUBLIC. Nothing in
-- 001–007 took any of that back. This migration does, in five parts:
--
--   1. SECURITY DEFINER functions: pin search_path, make the RPCs
--      service-role only, and add caller checks as defence in depth.
--   2. Analytics views: invoker rights; admin-only views not exposed at all.
--   3. Tables that never had RLS: enable it with no policies (service only).
--   4. Column-level holes: row policies said "your row" but not "which
--      columns", so users could grant themselves plans, entitlements,
--      quota resets, team ownership and un-revoked keys.
--   5. Self-checks that abort the migration if a definer function without a
--      pinned search_path, or a table without RLS, is left behind.
--
-- Safe to re-run: every policy is dropped before it is recreated, and
-- GRANT / REVOKE / ALTER ... SET are idempotent.
-- ============================================================


-- ─── 1. SECURITY DEFINER FUNCTIONS ───────────────────────────

-- A definer function runs with its owner's rights. Without a pinned
-- search_path, a caller who can create objects in any schema on their path
-- can shadow `marketplace_agents`, `NOW()` etc. and run code as the owner.
-- Trigger functions are included: they run as the owner too.
ALTER FUNCTION handle_new_user()                              SET search_path = public, pg_temp;
ALTER FUNCTION increment_agent_sales(UUID)                    SET search_path = public, pg_temp;
ALTER FUNCTION refresh_agent_rating()                         SET search_path = public, pg_temp;
ALTER FUNCTION increment_agent_installs(UUID)                 SET search_path = public, pg_temp;
ALTER FUNCTION increment_agent_runs(UUID)                     SET search_path = public, pg_temp;
ALTER FUNCTION refresh_run_progress()                         SET search_path = public, pg_temp;
ALTER FUNCTION team_role_of(UUID, UUID)                       SET search_path = public, pg_temp;
ALTER FUNCTION add_team_owner()                               SET search_path = public, pg_temp;
ALTER FUNCTION enforce_team_seats()                           SET search_path = public, pg_temp;
ALTER FUNCTION notify_user(UUID, notification_type, TEXT, TEXT, TEXT, JSONB)
                                                              SET search_path = public, pg_temp;
-- publish_agent_version, mark_notifications_read, is_team_member and
-- can_manage_team are redefined below with the setting inline.

-- Not definer, but the same reasoning applies cheaply.
ALTER FUNCTION update_updated_at()                            SET search_path = public, pg_temp;
ALTER FUNCTION stamp_run_completion()                         SET search_path = public, pg_temp;

-- publish_agent_version: previously anyone could call it for any agent and
-- replace that agent's current manifest (the product buyers pay for). The
-- EXECUTE grant is revoked below; this check is the second line. The API
-- calls it with the service-role key, whose JWT carries no `sub`, so
-- auth.uid() is NULL there and the call proceeds exactly as before. Any
-- caller that does carry a user identity must own the agent, and is
-- recorded as the author regardless of what it passes.
CREATE OR REPLACE FUNCTION publish_agent_version(
  agent_uuid   UUID,
  new_version  TEXT,
  new_manifest JSONB,
  note         TEXT DEFAULT NULL,
  author       UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  version_id UUID;
  caller     UUID := auth.uid();
BEGIN
  IF caller IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM marketplace_agents WHERE id = agent_uuid AND owner_id = caller
    ) THEN
      RAISE EXCEPTION 'Only the owner of agent % may publish a version', agent_uuid
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    author := caller;
  END IF;

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
$$;

-- mark_notifications_read: same pattern — a user identity may only clear
-- its own badge; the service role (no identity) may clear anyone's.
CREATE OR REPLACE FUNCTION mark_notifications_read(target_user UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  affected INT;
BEGIN
  IF auth.uid() IS NOT NULL AND target_user IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Cannot mark another user''s notifications read'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE notifications SET read_at = NOW()
  WHERE user_id = target_user AND read_at IS NULL;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- The membership helpers must stay executable by `authenticated`: the team
-- policies call them (005 explains why they are definer functions). But as
-- written they answer for ANY (team, user) pair, so any signed-in user
-- could probe who belongs to which team. Every policy passes auth.uid() as
-- the user, so answering only for the caller changes nothing for RLS. The
-- service role and maintenance sessions (no identity) keep full answers.
CREATE OR REPLACE FUNCTION is_team_member(team_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT (auth.uid() IS NULL OR user_uuid = auth.uid())
     AND EXISTS (
       SELECT 1 FROM team_members
       WHERE team_id = team_uuid AND user_id = user_uuid
     );
$$;

CREATE OR REPLACE FUNCTION can_manage_team(team_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT (auth.uid() IS NULL OR user_uuid = auth.uid())
     AND COALESCE(team_role_of(team_uuid, user_uuid) IN ('owner', 'admin'), FALSE);
$$;

-- RPCs that only the API (service role) calls. Postgres grants EXECUTE to
-- PUBLIC by default and Supabase adds explicit anon/authenticated grants,
-- so all three must be revoked.
REVOKE EXECUTE ON FUNCTION increment_agent_sales(UUID)                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION increment_agent_installs(UUID)                     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION increment_agent_runs(UUID)                         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION publish_agent_version(UUID, TEXT, JSONB, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION notify_user(UUID, notification_type, TEXT, TEXT, TEXT, JSONB)
                                                                              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION mark_notifications_read(UUID)                      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION team_role_of(UUID, UUID)                           FROM PUBLIC, anon, authenticated;
-- Invoker-rights maintenance functions. RLS already neuters them for end
-- users, but there is no reason to expose them through PostgREST at all.
REVOKE EXECUTE ON FUNCTION reset_monthly_usage()                              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION claim_jobs(TEXT, INT)                              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION complete_job(UUID)                                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION fail_job(UUID, TEXT)                               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION requeue_stalled_jobs(INT)                          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION purge_expired_oauth_states()                       FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  increment_agent_sales(UUID),
  increment_agent_installs(UUID),
  increment_agent_runs(UUID),
  publish_agent_version(UUID, TEXT, JSONB, TEXT, UUID),
  notify_user(UUID, notification_type, TEXT, TEXT, TEXT, JSONB),
  mark_notifications_read(UUID),
  team_role_of(UUID, UUID),
  is_team_member(UUID, UUID),
  can_manage_team(UUID, UUID),
  reset_monthly_usage(),
  claim_jobs(TEXT, INT),
  complete_job(UUID),
  fail_job(UUID, TEXT),
  requeue_stalled_jobs(INT),
  purge_expired_oauth_states()
TO service_role;

-- Policy helpers: signed-in users need them (RLS evaluates them as the
-- caller); anonymous visitors do not, once the one policy anon could reach
-- is scoped to `authenticated` (below).
REVOKE EXECUTE ON FUNCTION is_team_member(UUID, UUID)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION can_manage_team(UUID, UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION is_team_member(UUID, UUID), can_manage_team(UUID, UUID) TO authenticated;

-- Anonymous visitors browse public listings. The team-visibility policy is
-- only meaningful for a signed-in user, and scoping it means anon never
-- needs the membership helper.
DROP POLICY IF EXISTS "Team agents visible to members" ON marketplace_agents;
CREATE POLICY "Team agents visible to members" ON marketplace_agents
  FOR SELECT TO authenticated USING (
    (visibility = 'team' AND team_id IS NOT NULL AND is_team_member(team_id, auth.uid()))
    OR EXISTS (
      SELECT 1 FROM agent_shares s
      WHERE s.agent_id = marketplace_agents.id AND is_team_member(s.team_id, auth.uid())
    )
  );

-- Team tables are for members only; anon has no business there.
REVOKE ALL ON teams, team_members, team_invites, agent_shares FROM anon;


-- ─── 2. ANALYTICS VIEWS ──────────────────────────────────────

-- A view runs with its owner's rights unless told otherwise, so it skips the
-- querying user's RLS on the tables beneath it — and PostgREST exposes every
-- view in `public`. 007 explains this for integration_connections; these
-- four predate it and leaked every tenant's activity, emails and spend.
ALTER VIEW v_daily_stats       SET (security_invoker = true);
ALTER VIEW v_user_ltv          SET (security_invoker = true);
ALTER VIEW v_run_daily_stats   SET (security_invoker = true);
ALTER VIEW v_agent_performance SET (security_invoker = true);

-- Platform-wide KPIs (every user's email, plan and AI spend): back office
-- only. The service role reads them; end users never see them at all.
REVOKE ALL ON v_daily_stats, v_user_ltv FROM PUBLIC, anon, authenticated;
GRANT SELECT ON v_daily_stats, v_user_ltv TO service_role;

-- Per-user views: with invoker rights a user sees only their own runs.
-- Read-only, signed-in only.
REVOKE ALL ON v_run_daily_stats, v_agent_performance, integration_connections FROM PUBLIC, anon, authenticated;
GRANT SELECT ON v_run_daily_stats, v_agent_performance, integration_connections TO authenticated, service_role;


-- ─── 3. TABLES THAT NEVER HAD RLS ────────────────────────────

-- Without RLS, Supabase's default grants made these readable AND writable
-- by anyone holding the anon key: Stripe events, device fingerprints and
-- trial counters (reset your own `actions_used`), the referral ledger, and
-- the AI response cache (poison another user's answers). RLS with no
-- policy denies every ordinary role; the service role bypasses it.
ALTER TABLE billing_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE anonymous_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals          ENABLE ROW LEVEL SECURITY;
ALTER TABLE response_cache     ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON billing_events, anonymous_sessions, referrals, response_cache FROM PUBLIC, anon, authenticated;
GRANT ALL ON billing_events, anonymous_sessions, referrals, response_cache TO service_role;

-- RLS-on, no-policy tables: also drop the write grants so a mistake in a
-- future policy cannot silently open them.
REVOKE INSERT, UPDATE, DELETE ON workflow_runs, analytics_events, job_queue, oauth_states, agent_purchases,
                                 subscriptions, usage_periods, agent_run_steps
  FROM anon, authenticated;

-- ai_requests carried `FOR INSERT WITH CHECK (true)` "for the service" —
-- but the service bypasses RLS, so the only thing that policy did was let
-- anyone (anon included) insert usage rows attributed to any user,
-- inflating their quota and cost figures.
DROP POLICY IF EXISTS "Service can insert requests" ON ai_requests;
REVOKE INSERT, UPDATE, DELETE ON ai_requests FROM anon, authenticated;


-- ─── 4. COLUMN-LEVEL HOLES ───────────────────────────────────
-- Note: REVOKE on a table also revokes any column grants, so each block
-- revokes first and then grants back exactly the safe columns.

-- profiles: "update own profile" covered every column, so a user could set
-- plan = 'enterprise', swap email or stripe_customer_id, or rewrite
-- referred_by. Only cosmetic preferences are self-service; the rest is
-- written by the API (signup, billing webhook) as the service role.
REVOKE INSERT, UPDATE, DELETE ON profiles FROM anon, authenticated;
REVOKE SELECT ON profiles FROM anon;
GRANT UPDATE (name, avatar_url, timezone, language, onboarded) ON profiles TO authenticated;

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- agent_installs: an install row IS the entitlement (runs.ts checks it
-- before running an agent), and FOR ALL let a user insert one for a paid
-- agent they never bought. Installs are created by the API after it checks
-- price, purchase and plan. Users may read and remove their own.
DROP POLICY IF EXISTS "Users manage own installs" ON agent_installs;
DROP POLICY IF EXISTS "Users read own installs" ON agent_installs;
DROP POLICY IF EXISTS "Users remove own installs" ON agent_installs;
CREATE POLICY "Users read own installs" ON agent_installs
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users remove own installs" ON agent_installs
  FOR DELETE TO authenticated USING (user_id = auth.uid());
REVOKE INSERT, UPDATE ON agent_installs FROM anon, authenticated;
REVOKE DELETE ON agent_installs FROM anon;

-- agent_versions: direct inserts skipped the API's manifest validation
-- (undeclared capabilities, version ordering). Publishing goes through the
-- API and publish_agent_version only.
DROP POLICY IF EXISTS "Owners write versions" ON agent_versions;
REVOKE INSERT, UPDATE, DELETE ON agent_versions FROM anon, authenticated;

-- marketplace_agents: owners could write their own rating_avg,
-- install_count, sales_count and run_count, flip a suspended agent back to
-- 'listed' (skipping review and publish validation), move the version
-- pointer, or attach the agent to any team. Content fields stay editable.
REVOKE INSERT, UPDATE ON marketplace_agents FROM anon, authenticated;
REVOKE DELETE ON marketplace_agents FROM anon;
GRANT INSERT (owner_id, slug, name, tagline, description, category, capabilities, goal,
              price_cents, currency, visibility, min_plan)
  ON marketplace_agents TO authenticated;
GRANT UPDATE (slug, name, tagline, description, category, capabilities, goal,
              price_cents, currency, visibility, min_plan)
  ON marketplace_agents TO authenticated;

-- agent_runs: update/delete let a user delete or back-date runs to reset
-- their monthly quota, or rewrite cost/status. Runs are written by the API.
-- Inserting keeps a narrow grant (no started_at, status, cost, agent or
-- team), so a user can neither back-date nor attribute runs to an agent.
DROP POLICY IF EXISTS "Users update own runs" ON agent_runs;
DROP POLICY IF EXISTS "Users delete own runs" ON agent_runs;
REVOKE INSERT, UPDATE, DELETE ON agent_runs FROM anon, authenticated;
GRANT INSERT (user_id, goal, source_url, domain) ON agent_runs TO authenticated;

-- stored_files: FOR ALL let a user insert a row pointing at ANY object key
-- (storage_path) — including another user's — with expires_at in the past,
-- which the cleanup job then acts on. Rows are written by the API.
DROP POLICY IF EXISTS "Users own files" ON stored_files;
DROP POLICY IF EXISTS "Users read own files" ON stored_files;
CREATE POLICY "Users read own files" ON stored_files
  FOR SELECT USING (user_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON stored_files FROM anon, authenticated;

-- workflows: the API validates cron expressions and plan limits before
-- scheduling, and owns the scheduler bookkeeping. Direct writes could set
-- next_run_at / schedule_cron (bypassing both), run_count, or attach any
-- agent or team. Users keep editing the workflow's content.
REVOKE INSERT, UPDATE ON workflows FROM anon, authenticated;
GRANT INSERT (user_id, name, description, trigger_type, trigger_config, steps, is_active)
  ON workflows TO authenticated;
GRANT UPDATE (name, description, trigger_type, trigger_config, steps, is_active)
  ON workflows TO authenticated;

-- integrations: 007 says tokens must never reach the browser, but the table
-- policy still let the owner select access_token / refresh_token / metadata
-- directly. Reads are limited to what integration_connections exposes, and
-- connections are created and refreshed only by the server-side OAuth flow.
-- Disconnecting (DELETE own) stays available.
REVOKE SELECT, INSERT, UPDATE ON integrations FROM anon, authenticated;
REVOKE DELETE ON integrations FROM anon;
GRANT SELECT (id, user_id, provider, workspace_id, workspace_name, scopes, expires_at,
              connected_at, last_used_at, last_refreshed_at, refresh_error, token_encrypted)
  ON integrations TO authenticated;

-- teams: admins could rewrite owner_id (steal the team), seats and plan
-- (free capacity), and creators could insert a team with any plan/seats.
-- Billing-controlled columns are written by the service role only.
REVOKE INSERT, UPDATE ON teams FROM authenticated;
GRANT INSERT (name, slug, owner_id) ON teams TO authenticated;
GRANT UPDATE (name, slug) ON teams TO authenticated;

-- team_members: an admin could promote themselves (or anyone) to 'owner',
-- demote or remove the real owner, or move rows between teams. Admins now
-- manage non-owner rows only, and only the role column is updatable.
-- Ownership transfer is an explicit API operation.
DROP POLICY IF EXISTS "Admins manage the roster" ON team_members;
DROP POLICY IF EXISTS "Admins change roles" ON team_members;
DROP POLICY IF EXISTS "Admins remove members or members leave" ON team_members;
DROP POLICY IF EXISTS "Admins add non-owner members" ON team_members;
DROP POLICY IF EXISTS "Admins change non-owner roles" ON team_members;
DROP POLICY IF EXISTS "Admins remove non-owners or members leave" ON team_members;

CREATE POLICY "Admins add non-owner members" ON team_members
  FOR INSERT TO authenticated
  WITH CHECK (can_manage_team(team_id, auth.uid()) AND role <> 'owner');

CREATE POLICY "Admins change non-owner roles" ON team_members
  FOR UPDATE TO authenticated
  USING (can_manage_team(team_id, auth.uid()) AND role <> 'owner')
  WITH CHECK (can_manage_team(team_id, auth.uid()) AND role <> 'owner');

-- The owner cannot be removed (or leave) through the roster: that would
-- leave teams.owner_id pointing at a non-member.
CREATE POLICY "Admins remove non-owners or members leave" ON team_members
  FOR DELETE TO authenticated
  USING (role <> 'owner' AND (can_manage_team(team_id, auth.uid()) OR user_id = auth.uid()));

REVOKE INSERT, UPDATE ON team_members FROM authenticated;
GRANT INSERT (team_id, user_id, role) ON team_members TO authenticated;
GRANT UPDATE (role) ON team_members TO authenticated;

-- team_invites: mirror the API rule "ownership cannot be granted by
-- invitation" so a direct insert cannot mint an owner invite either.
DROP POLICY IF EXISTS "Admins manage invites" ON team_invites;
CREATE POLICY "Admins manage invites" ON team_invites
  FOR ALL TO authenticated
  USING (can_manage_team(team_id, auth.uid()))
  WITH CHECK (can_manage_team(team_id, auth.uid()) AND role <> 'owner');

-- api_keys: the "revoke" policy allowed updating every column, so a user
-- could un-revoke a key (revoked_at = NULL), widen its scopes or extend its
-- expiry. Revocation goes through the API; deleting your own key remains.
-- The hash is also withheld from direct reads.
DROP POLICY IF EXISTS "Users revoke own api keys" ON api_keys;
REVOKE ALL ON api_keys, api_key_usage FROM anon;
REVOKE SELECT, INSERT, UPDATE ON api_keys FROM authenticated;
GRANT SELECT (id, user_id, team_id, name, key_prefix, scopes, last_used_at, expires_at,
              revoked_at, created_at)
  ON api_keys TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON api_key_usage FROM authenticated;

-- notifications: "mark read" is the only legitimate user write; the old
-- policy also let a user rewrite a notification's title, body and link.
REVOKE UPDATE ON notifications FROM anon, authenticated;
GRANT UPDATE (read_at) ON notifications TO authenticated;


-- ─── 5. SELF-CHECKS ──────────────────────────────────────────

-- Abort (rolling the migration back) if anything above missed a case, or if
-- a later edit to 001–007 adds one without updating this file.
DO $$
DECLARE
  offenders TEXT;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ')
    INTO offenders
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.prosecdef
     AND NOT EXISTS (
       SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}')) AS c WHERE c LIKE 'search_path=%'
     );
  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION 'SECURITY DEFINER functions without a pinned search_path: %', offenders;
  END IF;

  SELECT string_agg(c.relname, ', ')
    INTO offenders
    FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relkind IN ('r', 'p')
     AND NOT c.relrowsecurity;
  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION 'Tables in public without row level security: %', offenders;
  END IF;

  SELECT string_agg(c.relname, ', ')
    INTO offenders
    FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relkind = 'v'
     AND NOT COALESCE(c.reloptions::text[] && ARRAY['security_invoker=true', 'security_invoker=on'], FALSE);
  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION 'Views in public without security_invoker: %', offenders;
  END IF;
END $$;
