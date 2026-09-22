'use client'

// ============================================================
// TASKPILOT — PHASE DEMOS
// apps/web/src/components/marketing/phase-demos.tsx
//
// The three self-contained product simulations shown on the back of each
// phase card: Smart Paste actually mapping fields, the AI Sidebar actually
// reading page content, Browser Actions actually working a checklist. Real
// product concepts, not stock art — each one argues its phase on its own.
//
// All CSS lives in ONE <PhaseDemoStyles /> tag rendered once by the parent,
// never one per card. The cards are interactive elements and <style> is not
// valid phrasing content inside one: the HTML parser relocates it during SSR
// parsing while React's hydration expects it to stay put, which produces a
// hydration mismatch rather than a styling bug. Keeping styles at the root
// sidesteps the nesting instead of working around it.
// ============================================================

import { IconCheck } from '@/components/ui/icons'
import type { PhaseId } from './phases'

export function PhaseDemo({ id }: { id: PhaseId }) {
  if (id === 'smart-paste') return <SmartPasteDemo />
  if (id === 'ai-sidebar') return <SidebarDemo />
  return <ActionsDemo />
}

// ─── PHASE 1 — SMART PASTE ──────────────────────────────────
// COPY -> UNDERSTAND -> MAP -> FILL

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
          {rows.map((r) => (
            <div key={r.label} className="sp-clip-line">{r.value}</div>
          ))}
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
          <div key={s} className="ac-step" style={{ animationDelay: `${0.4 + i * 0.4}s` }}>
            <span className="ac-step-mark" style={{ animationDelay: `${0.4 + i * 0.4}s` }} />
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

/** Render exactly once, above the deck. See the file header for why. */
export function PhaseDemoStyles() {
  return (
    <style>{`
      /* ── Phase 1 — Smart Paste ── */
      .sp-demo { display: grid; grid-template-columns: 1fr auto 1fr; gap: 10px; align-items: center; }
      .sp-col-label { font-size: 9.5px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--foreground-muted); margin-bottom: 6px; }
      .sp-clip { background: var(--background); border: 1px solid var(--border-subtle); border-radius: 7px; padding: 8px 9px; display: flex; flex-direction: column; gap: 4px; }
      .sp-clip-line { font-size: 10px; font-family: var(--font-mono, monospace); color: var(--foreground-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .sp-arrow { display: flex; align-items: center; justify-content: center; }
      .sp-arrow span { font-size: 9px; font-family: var(--font-mono, monospace); color: var(--indigo-light); background: rgba(109,118,245,0.12); padding: 3px 6px; border-radius: 5px; white-space: nowrap; }
      .sp-form { background: var(--background); border: 1px solid var(--border-subtle); border-radius: 7px; padding: 8px 9px; display: flex; flex-direction: column; gap: 5px; }
      .sp-field { display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 10px; opacity: 0; animation: sp-fill 4s ease-in-out infinite; }
      .sp-field-label { color: var(--foreground-muted); }
      .sp-field-value { display: flex; align-items: center; gap: 4px; color: var(--foreground-secondary); font-family: var(--font-mono, monospace); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .sp-check { color: var(--success); flex-shrink: 0; }
      @keyframes sp-fill { 0% { opacity: 0; transform: translateX(-4px); } 10%, 85% { opacity: 1; transform: translateX(0); } 95%, 100% { opacity: 0; } }
      @media (prefers-reduced-motion: reduce) { .sp-field { opacity: 1; animation: none; } }

      /* ── Phase 2 — AI Sidebar ── */
      .sb-chrome { display: flex; align-items: center; gap: 5px; padding: 7px 9px; background: var(--background); border: 1px solid var(--border-subtle); border-radius: 7px 7px 0 0; }
      .sb-dot { width: 6px; height: 6px; border-radius: 50%; }
      .sb-url { margin-left: 6px; font-size: 9px; color: var(--foreground-muted); font-family: var(--font-mono, monospace); }
      .sb-panel { border: 1px solid var(--border-subtle); border-top: none; border-radius: 0 0 7px 7px; padding: 10px; background: var(--background); }
      .sb-msg { display: flex; align-items: flex-start; gap: 6px; font-size: 11px; line-height: 1.5; color: var(--foreground-secondary); margin-bottom: 10px; }
      .sb-msg-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--cyan-light); margin-top: 4px; flex-shrink: 0; box-shadow: 0 0 0 3px rgba(52,208,232,0.18); animation: sb-pulse 2s ease-in-out infinite; }
      .sb-actions { display: flex; flex-wrap: wrap; gap: 5px; }
      .sb-chip { font-size: 10px; padding: 4px 8px; border-radius: var(--radius-full); background: var(--surface); border: 1px solid var(--border-subtle); color: var(--foreground-tertiary); }
      .sb-chip-hot { color: var(--cyan-light); border-color: rgba(52,208,232,0.35); animation: sb-chip-glow 3s ease-in-out infinite; }
      @keyframes sb-pulse { 0%, 100% { box-shadow: 0 0 0 3px rgba(52,208,232,0.18); } 50% { box-shadow: 0 0 0 6px rgba(52,208,232,0.06); } }
      @keyframes sb-chip-glow { 0%, 40%, 100% { background: var(--surface); } 60%, 85% { background: rgba(52,208,232,0.12); } }
      @media (prefers-reduced-motion: reduce) { .sb-msg-dot, .sb-chip-hot { animation: none; } }

      /* ── Phase 3 — Browser Actions ── */
      .ac-request { margin-bottom: 9px; }
      .ac-request-quote { font-size: 11.5px; font-style: italic; color: var(--foreground-secondary); }
      .ac-steps { display: flex; flex-direction: column; gap: 5px; margin-bottom: 9px; }
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
  )
}
