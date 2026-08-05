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
