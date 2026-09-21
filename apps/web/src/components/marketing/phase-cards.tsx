'use client'

// ============================================================
// TASKPILOT — PHASE CARDS
// apps/web/src/components/marketing/phase-cards.tsx
//
// The "Three phases. One browser layer." section on the landing page.
// Data-driven: PHASES below is the only thing to touch to add a Phase 4 —
// the component, the progression rail and the three demo visuals all
// render from it rather than hardcoding three cards.
//
// Each phase gets a small, self-contained product simulation (not stock
// art) that argues the point on its own even if nobody ever hovers it:
// Phase 1 shows a field actually getting mapped, Phase 2 shows the sidebar
// reading real page content, Phase 3 shows a checklist actually executing.
// Hover/click/focus only adds emphasis (border, elevation, glow) on top of
// content that's already there — nothing is gated behind hover, since nobody
// scrolling past on a phone will ever trigger it.
//
// All CSS lives in ONE <style> tag at the root, not one per card. Each card
// is a <button> (for keyboard/tap access), and <style> is not valid content
// inside <button> — the browser's HTML parser relocates it out during SSR
// parsing while React's hydration expects it to stay put, which is a
// hydration-mismatch bug, not a style bug. Keeping styles at the root avoids
// the nesting entirely rather than working around it.
// ============================================================

import { useState, type CSSProperties, type ReactNode } from 'react'
import { IconZap, IconSidebar, IconBot, IconCheck } from '@/components/ui/icons'

export interface PhaseData {
  id: 'smart-paste' | 'ai-sidebar' | 'browser-actions'
  number: string
  progressionLabel: string
  eyebrowLabel: string
  title: string
  description: string
  capabilities: string[]
  icon: ReactNode
  color: string
  bg: string
}

export const PHASES: PhaseData[] = [
  {
    id: 'smart-paste',
    number: '01',
    progressionLabel: 'Assist',
    eyebrowLabel: '01 · PHASE 1',
    title: 'Smart Paste',
    description:
      "Copy any text and press Alt+V. TaskPilot's 3-layer parser maps it to every field with 95%+ accuracy across HubSpot, Salesforce, Gmail and 50+ apps.",
    capabilities: ['3-layer parsing', 'Field detection', 'Semantic mapping', '95%+ accuracy'],
    icon: <IconZap size={18} />,
    color: 'var(--indigo-light)',
    bg: 'rgba(109,118,245,0.12)',
  },
  {
    id: 'ai-sidebar',
    number: '02',
    progressionLabel: 'Understand',
    eyebrowLabel: '02 · PHASE 2',
    title: 'AI Sidebar',
    description:
      'A floating copilot on every tab. Summarize, translate, extract emails and prices, draft replies, or export to Excel — without leaving the page.',
    capabilities: ['Summarize', 'Translate', 'Extract', 'Export'],
    icon: <IconSidebar size={18} />,
    color: 'var(--cyan-light)',
    bg: 'rgba(52,208,232,0.1)',
  },
  {
    id: 'browser-actions',
    number: '03',
    progressionLabel: 'Execute',
    eyebrowLabel: '03 · PHASE 3',
    title: 'Browser Actions',
    description:
      'Delegate whole workflows: "Save these leads to HubSpot." "Export this catalog to Excel." TaskPilot plans the steps, runs them, and shows the result.',
    capabilities: ['Planning', 'Multi-step execution', 'Verification', 'Result reporting'],
    icon: <IconBot size={18} />,
    color: 'var(--violet)',
    bg: 'rgba(167,139,250,0.1)',
  },
]

export function PhaseCards() {
  const [active, setActive] = useState(0)

  return (
    <div className="pc-root">
      {/* Progression rail — Assist -> Understand -> Execute */}
      <div className="pc-rail" role="presentation">
        {PHASES.map((p, i) => (
          <div key={p.id} className="pc-rail-group">
            <div className={`pc-rail-item${i === active ? ' pc-rail-item-active' : ''}`}>
              <span className="pc-rail-dot" />
              {p.progressionLabel}
            </div>
            {i < PHASES.length - 1 && <span className="pc-rail-arrow" aria-hidden="true">→</span>}
          </div>
        ))}
      </div>

      <div className="pc-grid">
        {PHASES.map((phase, i) => (
          <button
            key={phase.id}
            type="button"
            className={`pc-card${i === active ? ' pc-card-active' : ''}`}
            style={{ '--pc-accent': phase.color } as CSSProperties}
            aria-pressed={i === active}
            aria-label={`${phase.eyebrowLabel}: ${phase.title}`}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onClick={() => setActive(i)}
          >
            <div className="pc-card-head">
              <div className="pc-icon" style={{ background: phase.bg, color: phase.color }}>
                {phase.icon}
              </div>
              <span className="pc-phase-label">{phase.eyebrowLabel}</span>
            </div>

            <h3 className="pc-title">{phase.title}</h3>
            <p className="pc-desc">{phase.description}</p>

            <div className="pc-caps">
              {phase.capabilities.map((c) => (
                <span key={c} className="pc-cap">{c}</span>
              ))}
            </div>

            <div className="pc-demo-frame">
              {phase.id === 'smart-paste' && <SmartPasteDemo />}
              {phase.id === 'ai-sidebar' && <SidebarDemo />}
              {phase.id === 'browser-actions' && <ActionsDemo />}
            </div>
          </button>
        ))}
      </div>

      <style>{`
        .pc-root { margin-top: 40px; }

        /* ── Progression rail ── */
        .pc-rail {
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 28px; flex-wrap: wrap;
        }
        .pc-rail-group { display: flex; align-items: center; }
        .pc-rail-item {
          display: flex; align-items: center; gap: 7px;
          font-size: 12px; font-weight: 500; letter-spacing: 0.02em;
          color: var(--foreground-muted); text-transform: uppercase;
          transition: color 200ms var(--ease, ease-out);
        }
        .pc-rail-arrow { margin-left: 10px; color: var(--border-strong); font-size: 12px; }
        .pc-rail-dot {
          width: 5px; height: 5px; border-radius: 50%; background: var(--foreground-muted);
          transition: background 200ms var(--ease, ease-out), box-shadow 200ms var(--ease, ease-out);
        }
        .pc-rail-item-active { color: var(--foreground); }
        .pc-rail-item-active .pc-rail-dot {
          background: var(--indigo-light); box-shadow: 0 0 0 4px rgba(109,118,245,0.18);
        }

        /* ── Cards ── */
        .pc-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
        .pc-card {
          text-align: left; display: flex; flex-direction: column;
          background: var(--surface); border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg); padding: 22px 20px; cursor: pointer;
          font-family: inherit; color: inherit; opacity: 0.82;
          transition: opacity 220ms var(--ease, ease-out), border-color 220ms var(--ease, ease-out),
            box-shadow 220ms var(--ease, ease-out), transform 220ms var(--ease, ease-out),
            background 220ms var(--ease, ease-out);
        }
        .pc-card:hover { opacity: 0.94; }
        .pc-card-active {
          opacity: 1; background: var(--surface-hover, var(--surface));
          border-color: var(--pc-accent); transform: translateY(-3px);
          box-shadow: 0 16px 40px -12px color-mix(in srgb, var(--pc-accent) 35%, transparent);
        }

        .pc-card-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
        .pc-icon {
          width: 34px; height: 34px; border-radius: 9px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
        }
        .pc-phase-label {
          font-size: 11px; font-weight: 600; letter-spacing: 0.06em;
          color: var(--foreground-muted); text-transform: uppercase;
        }
        .pc-title { font-size: 17px; font-weight: 600; letter-spacing: -0.01em; margin-bottom: 7px; }
        .pc-desc { font-size: 13.5px; line-height: 1.6; color: var(--foreground-secondary); min-height: 84px; }

        .pc-caps { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px; }
        .pc-cap {
          font-size: 10.5px; font-weight: 500; padding: 3px 8px; border-radius: var(--radius-full);
          background: var(--surface-hover, rgba(255,255,255,0.04)); border: 1px solid var(--border-subtle);
          color: var(--foreground-tertiary);
        }

        .pc-demo-frame {
          margin-top: 18px; border-radius: var(--radius-md); overflow: hidden;
          border: 1px solid var(--border-subtle); background: var(--background);
          min-height: 168px;
        }

        @media (max-width: 900px) {
          .pc-grid { grid-template-columns: 1fr; }
          .pc-card-active { transform: none; }
          .pc-desc { min-height: 0; }
        }
        @media (max-width: 560px) {
          .pc-rail-arrow { margin-left: 6px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .pc-card, .pc-card-active { transition: none; transform: none; }
        }

        /* ── Phase 1 — Smart Paste demo ── */
        .sp-demo { display: grid; grid-template-columns: 1fr auto 1fr; gap: 10px; align-items: center; padding: 16px; }
        .sp-col-label { font-size: 9.5px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--foreground-muted); margin-bottom: 6px; }
        .sp-clip { background: var(--surface); border: 1px solid var(--border-subtle); border-radius: 7px; padding: 8px 9px; display: flex; flex-direction: column; gap: 4px; }
        .sp-clip-line { font-size: 10px; font-family: var(--font-mono, monospace); color: var(--foreground-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sp-arrow { display: flex; align-items: center; justify-content: center; }
        .sp-arrow span { font-size: 9px; font-family: var(--font-mono, monospace); color: var(--indigo-light); background: rgba(109,118,245,0.12); padding: 3px 6px; border-radius: 5px; white-space: nowrap; }
        .sp-form { background: var(--surface); border: 1px solid var(--border-subtle); border-radius: 7px; padding: 8px 9px; display: flex; flex-direction: column; gap: 5px; }
        .sp-field { display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 10px; opacity: 0; animation: sp-fill 4s ease-in-out infinite; }
        .sp-field-label { color: var(--foreground-muted); }
        .sp-field-value { display: flex; align-items: center; gap: 4px; color: var(--foreground-secondary); font-family: var(--font-mono, monospace); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sp-check { color: var(--success); flex-shrink: 0; }
        @keyframes sp-fill { 0% { opacity: 0; transform: translateX(-4px); } 10%, 85% { opacity: 1; transform: translateX(0); } 95%, 100% { opacity: 0; } }
        @media (max-width: 900px) { .sp-demo { grid-template-columns: 1fr; } .sp-arrow { transform: rotate(90deg); padding: 2px 0; } }
        @media (prefers-reduced-motion: reduce) { .sp-field { opacity: 1; animation: none; } }

        /* ── Phase 2 — AI Sidebar demo ── */
        .sb-demo { padding: 14px; }
        .sb-chrome { display: flex; align-items: center; gap: 5px; padding: 7px 9px; background: var(--surface); border: 1px solid var(--border-subtle); border-radius: 7px 7px 0 0; }
        .sb-dot { width: 6px; height: 6px; border-radius: 50%; }
        .sb-url { margin-left: 6px; font-size: 9px; color: var(--foreground-muted); font-family: var(--font-mono, monospace); }
        .sb-panel { border: 1px solid var(--border-subtle); border-top: none; border-radius: 0 0 7px 7px; padding: 10px; background: var(--surface); }
        .sb-msg { display: flex; align-items: flex-start; gap: 6px; font-size: 11px; line-height: 1.5; color: var(--foreground-secondary); margin-bottom: 10px; }
        .sb-msg-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--cyan-light); margin-top: 4px; flex-shrink: 0; box-shadow: 0 0 0 3px rgba(52,208,232,0.18); animation: sb-pulse 2s ease-in-out infinite; }
        .sb-actions { display: flex; flex-wrap: wrap; gap: 5px; }
        .sb-chip { font-size: 10px; padding: 4px 8px; border-radius: var(--radius-full); background: var(--background); border: 1px solid var(--border-subtle); color: var(--foreground-tertiary); }
        .sb-chip-hot { color: var(--cyan-light); border-color: rgba(52,208,232,0.35); animation: sb-chip-glow 3s ease-in-out infinite; }
        @keyframes sb-pulse { 0%, 100% { box-shadow: 0 0 0 3px rgba(52,208,232,0.18); } 50% { box-shadow: 0 0 0 6px rgba(52,208,232,0.06); } }
        @keyframes sb-chip-glow { 0%, 40%, 100% { background: var(--background); } 60%, 85% { background: rgba(52,208,232,0.12); } }
        @media (prefers-reduced-motion: reduce) { .sb-msg-dot, .sb-chip-hot { animation: none; } }

        /* ── Phase 3 — Browser Actions demo ── */
        .ac-demo { padding: 14px; }
        .ac-request { margin-bottom: 10px; }
        .ac-request-quote { font-size: 11.5px; font-style: italic; color: var(--foreground-secondary); }
        .ac-steps { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
        .ac-step {
          display: flex; align-items: center; gap: 7px; font-size: 10.5px; color: var(--foreground-muted);
          opacity: 0.4; animation: ac-reveal 4.5s ease-in-out infinite;
        }
        .ac-step-mark {
          width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0;
          border: 1.5px solid var(--border-strong); position: relative;
          animation: ac-mark 4.5s ease-in-out infinite;
        }
        @keyframes ac-reveal { 0% { opacity: 0.4; } 8%, 90% { opacity: 1; color: var(--foreground-secondary); } 96%, 100% { opacity: 0.4; color: var(--foreground-muted); } }
        @keyframes ac-mark {
          0% { border-color: var(--border-strong); background: transparent; }
          8%, 100% { border-color: var(--violet); background: var(--violet); box-shadow: inset 0 0 0 2px var(--background); }
        }
        .ac-done {
          display: flex; align-items: center; gap: 5px; font-size: 10.5px; font-weight: 600;
          color: var(--success); padding-top: 8px; border-top: 1px solid var(--border-subtle);
          opacity: 0; animation: ac-done 4.5s ease-in-out infinite;
        }
        @keyframes ac-done { 0%, 92% { opacity: 0; } 98%, 100% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .ac-step, .ac-step-mark { animation: none; opacity: 1; color: var(--foreground-secondary); }
          .ac-step-mark { border-color: var(--violet); background: var(--violet); }
          .ac-done { animation: none; opacity: 1; }
        }
      `}</style>
    </div>
  )
}

// ─── PHASE 1 — SMART PASTE ──────────────────────────────────
// COPY -> UNDERSTAND -> MAP -> FILL
// Pure markup — styles live in PhaseCards' single root <style> tag; see the
// note at the top of this file for why (a <style> inside a <button> is
// invalid HTML and causes a hydration mismatch, not just a lint nit).

function SmartPasteDemo() {
  const rows = [
    { label: 'Name', value: 'Sarah Chen' },
    { label: 'Role', value: 'VP Sales' },
    { label: 'Company', value: 'Acme' },
    { label: 'Email', value: 'sarah@acme.com' },
  ]
  return (
    <div className="sp-demo">
      <div>
        <div className="sp-col-label">Clipboard</div>
        <div className="sp-clip">
          {rows.map((r) => <div key={r.label} className="sp-clip-line">{r.value}</div>)}
        </div>
      </div>
      <div className="sp-arrow" aria-hidden>
        <span>Alt+V</span>
      </div>
      <div>
        <div className="sp-col-label">Form</div>
        <div className="sp-form">
          {rows.map((r, i) => (
            <div className="sp-field" key={r.label} style={{ animationDelay: `${i * 0.35}s` }}>
              <span className="sp-field-label">{r.label}</span>
              <span className="sp-field-value">
                <IconCheck size={11} className="sp-check" /> {r.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── PHASE 2 — AI SIDEBAR ───────────────────────────────────
// SEE -> UNDERSTAND -> ASSIST

function SidebarDemo() {
  const actions = ['Summarize', 'Extract prices', 'Translate', 'Export']
  return (
    <div className="sb-demo">
      <div className="sb-chrome">
        <span className="sb-dot" style={{ background: '#f87171' }} />
        <span className="sb-dot" style={{ background: '#fbbf24' }} />
        <span className="sb-dot" style={{ background: '#4ade80' }} />
        <span className="sb-url">shop.example.com/catalog</span>
      </div>
      <div className="sb-panel">
        <div className="sb-msg">
          <span className="sb-msg-dot" aria-hidden />
          I found 18 product prices on this page.
        </div>
        <div className="sb-actions">
          {actions.map((a, i) => (
            <span key={a} className={`sb-chip${i === 1 ? ' sb-chip-hot' : ''}`}>{a}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── PHASE 3 — BROWSER ACTIONS ──────────────────────────────
// REQUEST -> PLAN -> ACT -> VERIFY -> DONE

function ActionsDemo() {
  const steps = [
    'Open leads page',
    'Extract 24 leads',
    'Validate fields',
    'Open HubSpot',
    'Create contacts',
    'Verify results',
  ]
  return (
    <div className="ac-demo">
      <div className="ac-request">
        <span className="ac-request-quote">“Save these leads to HubSpot.”</span>
      </div>
      <div className="ac-steps">
        {steps.map((s, i) => (
          <div key={s} className="ac-step" style={{ animationDelay: `${0.5 + i * 0.5}s` }}>
            <span className="ac-step-mark" style={{ animationDelay: `${0.5 + i * 0.5}s` }} />
            {s}
          </div>
        ))}
      </div>
      <div className="ac-done">
        <IconCheck size={11} /> Done · 24 contacts created
      </div>
    </div>
  )
}
