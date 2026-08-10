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
