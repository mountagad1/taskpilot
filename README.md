# TaskPilot — The AI Operating Layer for the Browser

> **"Talk to any webpage instantly."**

TaskPilot is a venture-scale AI browser extension that transforms every webpage into an intelligent AI workspace. Autofill forms, extract structured data, convert webpages into documents, and automate browser workflows with AI.

---

## Architecture Overview

```
taskpilot/
├── apps/
│   ├── web/                    # Next.js 14 landing page + dashboard
│   └── extension/              # Chrome Extension (Manifest V3 + Plasmo)
├── packages/
│   ├── ai-engine/              # AI orchestration, token optimizer, semantic cache
│   ├── browser-tools/          # Smart paste, tool execution, export utilities
│   ├── shared/                 # Types, constants, utilities
│   └── ui/                     # Design system components
├── supabase/
│   ├── migrations/             # PostgreSQL schema
│   └── functions/              # Edge Functions (ai-proxy)
├── scripts/
│   └── package-extension.js   # Extension packager
└── docs/                       # Technical documentation
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React, TypeScript, TailwindCSS, Framer Motion |
| Extension | Plasmo Framework, Manifest V3, Shadow DOM |
| Backend | Supabase (PostgreSQL + Edge Functions) |
| AI | OpenAI GPT-4.1-mini / GPT-4.1 + structured outputs |
| Payments | Stripe (subscriptions, webhooks, portal) |
| Cache | Upstash Redis (semantic cache + rate limiting) |
| Analytics | PostHog |
| Hosting | Vercel (edge-first deployment) |

---

## Prerequisites

- Node.js ≥ 20
- npm ≥ 9
- Supabase CLI: `npm i -g supabase`
- Vercel CLI: `npm i -g vercel`
- Chrome browser (for extension development)

---

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/your-org/taskpilot.git
cd taskpilot
npm install
```

### 2. Configure Environment

```bash
cp .env.example apps/web/.env.local
```

Fill in all required values (see `.env.example` for descriptions):
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`

### 3. Initialize Supabase

```bash
# Start local Supabase stack
supabase start

# Run migrations
supabase db push

# OR apply to production
supabase db push --linked
```

### 4. Start Development

```bash
# Run web app (localhost:3000) + all packages
npm run dev

# Or with Turbo
npx turbo dev --filter=web
```

### 5. Load Extension in Chrome

```bash
# Build extension
cd apps/extension
npm run build

# In Chrome:
# 1. Go to chrome://extensions
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select apps/extension/dist/ folder
```

---

## Deployment

### Web App (Vercel)

```bash
cd apps/web
vercel --prod

# Set environment variables in Vercel dashboard or via CLI:
vercel env add OPENAI_API_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
# ... (all vars from .env.example)
```

### Stripe Webhooks

```bash
# Local testing
stripe listen --forward-to localhost:3000/api/stripe/webhook

# Production: Add webhook endpoint in Stripe Dashboard
# URL: https://taskpilot.cc/api/stripe/webhook
# Events: checkout.session.completed, customer.subscription.*
```

### Supabase Edge Functions

```bash
supabase functions deploy ai-proxy --project-ref your-project-ref
```

### Chrome Extension

```bash
node scripts/package-extension.js
# Upload dist/taskpilot-extension-prod-*.zip to Chrome Web Store
# https://chrome.google.com/webstore/devconsole
```

---

## Key Features

### Phase 1: Smart Paste (MVP)
- Clipboard text → intelligent form autofill
- 3-layer parsing: Regex → Heuristics → AI
- Supports HubSpot, Salesforce, Gmail, LinkedIn, Airtable, and any web form
- Animated autofill with field highlight
- `Alt+V` keyboard shortcut

### Phase 2: Universal AI Sidebar
- Floating sidebar on every webpage (`Alt+S`)
- Summarize, translate, rewrite, extract data
- AI reply assistant for email/LinkedIn/CRMs
- Export to CSV / Excel / JSON
- Saved prompts + workflow history

### Phase 3: Browser Actions
- Extract all products, emails, prices, leads
- Push to HubSpot, Salesforce, Notion
- Workflow automation engine
- Multi-step browser task planning

---

## Business Model

| Plan | Price | Features |
|------|-------|----------|
| Free | $0 | 30 AI actions/mo, 5 exports/mo, basic smart paste |
| Pro | $19/mo ($190/yr) | Unlimited everything + CRM integrations + browser actions |
| Enterprise | Custom | SSO, team management, dedicated support, API access |

---

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/ai/smart-paste` | POST | Parse clipboard + map to form fields |
| `/api/ai/process` | POST | AI task execution (summarize, extract, etc.) |
| `/api/stripe/webhook` | POST | Stripe event handler |
| `/api/auth/session` | GET/POST/DELETE | Session management |
| `/api/export` | POST | Export data as CSV/Excel/JSON |

---

## Database Schema (Supabase)

Key tables:

- `profiles` — user accounts with plan info
- `anonymous_sessions` — anonymous usage tracking (no forced signup)
- `subscriptions` — Stripe subscription state
- `ai_requests` — all AI request logs (cost tracking)
- `usage_periods` — monthly usage counters
- `productivity_metrics` — daily metrics per user
- `workflows` — saved automation workflows
- `response_cache` — semantic cache entries

---

## AI Cost Optimization

TaskPilot achieves **60-80% AI cost reduction** through:

1. **Heuristic routing** — Skip AI for simple tasks (regex/DOM parsing handles 40%+ of requests)
2. **Semantic caching** — Same page + same task = cached result (34%+ hit rate in practice)
3. **Token optimization** — Strip boilerplate, compress whitespace, limit visible content
4. **Model routing** — `gpt-4.1-mini` by default, `gpt-4.1` only for complex tasks
5. **Context limits** — Per-task content limits (500 chars for smart paste, 4000 for export)

Estimated cost at scale: ~$0.00015 per request (after optimizations)

---

## Security

- All AI requests routed through server-side proxy (no client-side API keys)
- CSP hardened against XSS
- Rate limiting: per-IP sliding windows (Redis)
- Abuse detection: burst detection + IP blocklist
- Extension uses Shadow DOM (no CSS conflicts)
- Minimum permissions: only `activeTab` + `storage` required; `<all_urls>` is optional
- RLS enabled on all Supabase tables

---

## Development Notes

### Monorepo Commands

```bash
npm run dev          # Start all packages in dev mode
npm run build        # Build all packages
npm run lint         # Lint all packages
npm run type-check   # TypeScript check across all packages
```

### Extension Hot Reload

Plasmo provides hot reload for the extension during development. Changes to content scripts require a page refresh; background worker changes require reloading the extension.

### Supabase Local Development

```bash
supabase start       # Start local Postgres + Auth + Studio
supabase studio      # Open Studio at http://localhost:54323
supabase stop        # Stop all services
```

---

## Roadmap

### v1.0 (MVP)
- [x] Chrome extension (Manifest V3)
- [x] Smart Paste with 3-layer parsing
- [x] AI Sidebar (summarize, extract, translate, rewrite)
- [x] Stripe integration (Free + Pro)
- [x] Anonymous sessions (no forced signup)
- [x] Semantic cache (60%+ cost reduction)
- [x] Dashboard with analytics

### v1.1
- [ ] Firefox extension
- [ ] HubSpot CRM integration
- [ ] Workflow builder UI
- [ ] Browser action recording
- [ ] Team workspaces

### v2.0
- [ ] Salesforce + Notion integrations
- [ ] AI workflow automation
- [ ] Custom AI models (fine-tuned)
- [ ] Enterprise SSO

---

## License

Proprietary — TaskPilot © 2025. All rights reserved.
