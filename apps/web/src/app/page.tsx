// ============================================================
// TASKPILOT — LANDING PAGE
// Premium dark SaaS. Inter, compact rhythm, SVG icons.
// ============================================================

'use client'

import { useEffect, useState } from 'react'
import { Reveal } from '@/components/ui/reveal'
import {
  IconZap, IconSidebar, IconBot, IconTable, IconMail, IconGlobe,
  IconGauge, IconArrowRight, IconCheck, IconChrome, IconPlay,
  IconLock, IconStar, IconLogo, IconChart,
} from '@/components/ui/icons'

const css = `
.lp { --lp-fg: var(--foreground); }

/* ── Nav ── */
.lp-nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 100;
  height: var(--nav-height);
  display: flex; align-items: center;
  background: rgba(8, 8, 11, 0.72);
  border-bottom: 1px solid var(--border-subtle);
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
}
.lp-nav-inner { width: 100%; max-width: var(--container); margin-inline: auto; padding-inline: 24px; display: flex; align-items: center; justify-content: space-between; }
.lp-logo { display: flex; align-items: center; gap: 9px; text-decoration: none; color: var(--foreground); }
.lp-logo-mark { width: 28px; height: 28px; border-radius: 8px; background: var(--gradient-brand); display: flex; align-items: center; justify-content: center; color: #fff; box-shadow: var(--shadow-accent); }
.lp-logo-name { font-size: 15px; font-weight: 600; letter-spacing: -0.02em; }
.lp-nav-links { display: flex; align-items: center; gap: 4px; }
.lp-nav-links a { padding: 7px 12px; border-radius: 7px; font-size: 14px; font-weight: 450; color: var(--foreground-secondary); text-decoration: none; transition: color var(--transition-fast), background var(--transition-fast); }
.lp-nav-links a:hover { color: var(--foreground); background: var(--surface); }
.lp-nav-cta { display: flex; align-items: center; gap: 8px; }

/* ── Hero ── */
.lp-hero { position: relative; padding-top: 132px; padding-bottom: 72px; text-align: center; overflow: hidden; }
.lp-hero-glow { position: absolute; top: -60px; left: 50%; transform: translateX(-50%); width: 780px; max-width: 120vw; height: 460px; background: radial-gradient(ellipse at center, rgba(109,118,245,0.14) 0%, transparent 66%); pointer-events: none; }
.lp-hero h1 { font-size: clamp(38px, 6vw, 58px); font-weight: 600; letter-spacing: -0.032em; line-height: 1.05; max-width: 780px; margin-inline: auto; }
.lp-hero-sub { margin: 18px auto 0; max-width: 580px; font-size: clamp(15px, 2vw, 17px); line-height: 1.55; color: var(--foreground-secondary); }
.lp-hero-actions { margin-top: 28px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
.lp-hero-note { margin-top: 14px; font-size: 12.5px; color: var(--foreground-tertiary); }

/* ── Browser mockup ── */
.lp-mock-wrap { margin: 52px auto 0; max-width: 880px; position: relative; }
.lp-mock-wrap::before { content: ''; position: absolute; inset: -1px; border-radius: 15px; padding: 1px; background: linear-gradient(180deg, rgba(255,255,255,0.14), transparent 40%); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none; }
.lp-browser { background: var(--background-secondary); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; box-shadow: var(--shadow-xl); }
.lp-browser-bar { display: flex; align-items: center; gap: 10px; padding: 10px 13px; background: var(--background-tertiary); border-bottom: 1px solid var(--border-subtle); }
.lp-dots { display: flex; gap: 6px; }
.lp-dots span { width: 10px; height: 10px; border-radius: 50%; }
.lp-dots span:nth-child(1){background:#ff5f57} .lp-dots span:nth-child(2){background:#febc2e} .lp-dots span:nth-child(3){background:#28c840}
.lp-url { flex: 1; display: flex; align-items: center; gap: 6px; padding: 4px 11px; border-radius: 6px; background: var(--surface); border: 1px solid var(--border-subtle); font-family: var(--font-code); font-size: 11.5px; color: var(--foreground-tertiary); }
.lp-browser-body { position: relative; min-height: 300px; padding: 22px; text-align: left; }
.lp-crm-head { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; padding-bottom: 14px; border-bottom: 1px solid var(--border-subtle); }
.lp-crm-logo { width: 30px; height: 30px; border-radius: 8px; background: linear-gradient(135deg,#ff7a59,#ff4500); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: #fff; }
.lp-crm-title { font-size: 13.5px; font-weight: 600; }
.lp-crm-sub { font-size: 11px; color: var(--foreground-tertiary); }
.lp-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 11px; max-width: 520px; }
.lp-field { display: flex; flex-direction: column; gap: 5px; }
.lp-field label { font-size: 10.5px; font-weight: 500; letter-spacing: 0.03em; text-transform: uppercase; color: var(--foreground-tertiary); }
.lp-input { height: 34px; padding: 0 11px; border-radius: 7px; background: var(--surface); border: 1px solid var(--border-subtle); color: var(--foreground); font-size: 13px; font-family: var(--font-body); transition: all 0.3s var(--ease); display: flex; align-items: center; }
.lp-input.filled { border-color: rgba(109,118,245,0.5); background: rgba(109,118,245,0.07); color: var(--foreground); }
.lp-input.empty { color: var(--foreground-muted); }

/* Sidebar on mock */
.lp-sb { position: absolute; right: 0; top: 0; bottom: 0; width: 210px; background: rgba(11,11,15,0.96); border-left: 1px solid var(--border); display: flex; flex-direction: column; }
.lp-sb-head { display: flex; align-items: center; justify-content: space-between; padding: 11px 13px; border-bottom: 1px solid var(--border-subtle); }
.lp-sb-logo { display: flex; align-items: center; gap: 6px; }
.lp-sb-mark { width: 18px; height: 18px; border-radius: 5px; background: var(--gradient-brand); display: flex; align-items: center; justify-content: center; color: #fff; }
.lp-sb-name { font-size: 12px; font-weight: 600; }
.lp-sb-body { flex: 1; padding: 11px; display: flex; flex-direction: column; gap: 8px; }
.lp-msg { display: flex; gap: 6px; }
.lp-msg.user { flex-direction: row-reverse; }
.lp-av { width: 21px; height: 21px; border-radius: 6px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: var(--foreground-secondary); }
.lp-msg.ai .lp-av { background: rgba(109,118,245,0.16); color: var(--indigo-light); }
.lp-msg.user .lp-av { background: var(--surface-active); }
.lp-bubble { max-width: calc(100% - 28px); padding: 7px 9px; border-radius: 8px; font-size: 11.5px; line-height: 1.5; }
.lp-msg.ai .lp-bubble { background: var(--surface); border: 1px solid var(--border-subtle); color: var(--foreground-secondary); }
.lp-msg.user .lp-bubble { background: rgba(109,118,245,0.14); border: 1px solid rgba(109,118,245,0.2); color: var(--foreground); }
.lp-typing { display: flex; gap: 3px; padding: 3px 0; }
.lp-typing span { width: 4px; height: 4px; border-radius: 50%; background: var(--indigo-light); animation: lp-blink 1.2s ease infinite; }
.lp-typing span:nth-child(2){animation-delay:.2s} .lp-typing span:nth-child(3){animation-delay:.4s}
@keyframes lp-blink { 0%,60%,100%{opacity:.3} 30%{opacity:1} }
.lp-chip-row { display: flex; gap: 4px; margin-top: 5px; }
.lp-chip { padding: 3px 8px; border-radius: 6px; font-size: 10px; font-weight: 500; border: 1px solid var(--border-subtle); background: var(--surface); color: var(--foreground-tertiary); }
.lp-sb-input { padding: 9px 11px; border-top: 1px solid var(--border-subtle); display: flex; gap: 6px; align-items: center; }
.lp-sb-input input { flex: 1; height: 26px; padding: 0 8px; border-radius: 6px; background: var(--surface); border: 1px solid var(--border-subtle); color: var(--foreground); font-size: 11px; font-family: var(--font-body); outline: none; }

/* ── Stats ── */
.lp-stats { border-top: 1px solid var(--border-subtle); border-bottom: 1px solid var(--border-subtle); background: var(--background-secondary); }
.lp-stats-inner { display: flex; flex-wrap: wrap; justify-content: center; }
.lp-stat { flex: 1; min-width: 190px; padding: 26px 16px; text-align: center; border-right: 1px solid var(--border-subtle); }
.lp-stat:last-child { border-right: none; }
.lp-stat-n { font-size: clamp(22px, 2.2vw, 28px); font-weight: 600; letter-spacing: -0.02em; line-height: 1.2; }
.lp-stat-l { margin-top: 4px; font-size: 13px; color: var(--foreground-tertiary); }

/* ── How / grid ── */
.lp-how { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 48px; }
.lp-how-icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; margin-bottom: 14px; }
.lp-phase { font-family: var(--font-code); font-size: 11px; color: var(--foreground-tertiary); letter-spacing: 0.06em; margin-bottom: 12px; }
.lp-how h3 { font-size: 16px; font-weight: 600; margin-bottom: 7px; letter-spacing: -0.01em; }
.lp-how p { font-size: 13.5px; line-height: 1.6; color: var(--foreground-secondary); }

/* ── Features bento ── */
.lp-feat { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-top: 48px; }
.lp-feat-lg { grid-column: span 2; grid-row: span 2; }
.lp-feat-wide { grid-column: span 2; }
.feature-card h3 { margin-bottom: 6px; }
.lp-code { background: var(--background-tertiary); border: 1px solid var(--border-subtle); border-radius: 10px; padding: 14px; font-family: var(--font-code); font-size: 12px; line-height: 1.75; margin-top: 14px; }
.lp-metric { display: flex; align-items: center; justify-content: space-between; padding: 9px 12px; background: var(--surface); border: 1px solid var(--border-subtle); border-radius: 8px; }
.lp-metric-l { font-size: 13px; color: var(--foreground-secondary); }
.lp-metric-v { font-family: var(--font-code); font-size: 11.5px; }

/* ── Demo ── */
.lp-demo-inner { display: grid; grid-template-columns: 1fr 1.15fr; gap: 40px; align-items: start; margin-top: 44px; }
.lp-steps { display: flex; flex-direction: column; gap: 3px; }
.lp-step { padding: 15px 16px; border-radius: 10px; cursor: pointer; border: 1px solid transparent; transition: all var(--transition-fast); }
.lp-step.active { background: var(--surface); border-color: var(--border); }
.lp-step-n { font-family: var(--font-code); font-size: 10.5px; color: var(--foreground-tertiary); margin-bottom: 4px; }
.lp-step.active .lp-step-n { color: var(--indigo-light); }
.lp-step h4 { font-size: 14px; font-weight: 550; color: var(--foreground-secondary); margin-bottom: 3px; }
.lp-step.active h4 { color: var(--foreground); }
.lp-step p { font-size: 12.5px; line-height: 1.5; color: var(--foreground-tertiary); display: none; }
.lp-step.active p { display: block; }
.lp-preview { background: var(--background-secondary); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; position: sticky; top: 84px; }
.lp-preview-head { padding: 9px 13px; border-bottom: 1px solid var(--border-subtle); background: var(--background-tertiary); display: flex; align-items: center; gap: 8px; }
.lp-preview-body { padding: 18px; }
.lp-clip { background: var(--surface); border: 1px solid var(--border-subtle); border-radius: 9px; padding: 13px; margin-bottom: 13px; font-family: var(--font-code); font-size: 11.5px; line-height: 1.6; color: var(--foreground-tertiary); }
.lp-clip-head { display: flex; align-items: center; gap: 6px; font-family: var(--font-body); font-size: 10px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--foreground-muted); margin-bottom: 8px; }
.lp-mini { display: flex; flex-direction: column; gap: 7px; }
.lp-mini-row { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 7px; background: var(--surface); border: 1px solid var(--border-subtle); transition: all 0.3s var(--ease); }
.lp-mini-l { font-size: 10px; font-weight: 500; color: var(--foreground-muted); width: 58px; flex-shrink: 0; }
.lp-mini-v { font-size: 11.5px; color: var(--foreground-tertiary); }
.lp-mini-row.filled { border-color: rgba(109,118,245,0.4); background: rgba(109,118,245,0.07); }
.lp-mini-row.filled .lp-mini-v { color: var(--foreground); }
.lp-progress { height: 2px; background: var(--surface-active); border-radius: 1px; margin-top: 11px; overflow: hidden; }
.lp-progress-fill { height: 100%; background: var(--gradient-brand); border-radius: 1px; transition: width 0.4s var(--ease); }
.lp-demo-status { margin-top: 9px; font-family: var(--font-code); font-size: 10.5px; color: var(--foreground-tertiary); }

/* ── Integrations ── */
.lp-int { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; max-width: 680px; margin: 32px auto 0; }
.lp-pill { padding: 7px 14px; border-radius: var(--radius-full); background: var(--surface); border: 1px solid var(--border-subtle); font-size: 13px; font-weight: 500; color: var(--foreground-secondary); transition: all var(--transition-fast); }
.lp-pill:hover { background: var(--surface-hover); border-color: var(--border-strong); color: var(--foreground); }
.lp-pill.accent { background: rgba(109,118,245,0.1); border-color: rgba(109,118,245,0.24); color: var(--indigo-light); }

/* ── Pricing ── */
.lp-price { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; max-width: 920px; margin: 44px auto 0; }
.lp-price-card { position: relative; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 26px 24px; text-align: left; transition: all var(--transition-fast); }
.lp-price-card:hover { border-color: var(--border-strong); }
.lp-price-card.feat { background: linear-gradient(180deg, rgba(109,118,245,0.09), rgba(109,118,245,0.02)); border-color: rgba(109,118,245,0.3); }
.lp-price-badge { position: absolute; top: -10px; left: 50%; transform: translateX(-50%); padding: 4px 12px; border-radius: var(--radius-full); background: var(--gradient-brand); font-size: 11px; font-weight: 600; color: #fff; white-space: nowrap; }
.lp-price-name { font-size: 12.5px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--foreground-tertiary); margin-bottom: 10px; }
.lp-price-amt { font-size: 34px; font-weight: 600; letter-spacing: -0.03em; line-height: 1; }
.lp-price-amt sup { font-size: 18px; font-weight: 500; vertical-align: top; top: 5px; margin-right: 1px; }
.lp-price-per { font-size: 12.5px; color: var(--foreground-tertiary); margin: 5px 0 20px; }
.lp-price-div { height: 1px; background: var(--border-subtle); margin-bottom: 20px; }
.lp-price-feats { list-style: none; display: flex; flex-direction: column; gap: 9px; margin: 0 0 24px; padding: 0; }
.lp-price-feats li { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; color: var(--foreground-secondary); line-height: 1.4; }
.lp-price-feats li svg { color: var(--success); flex-shrink: 0; margin-top: 1px; }
.lp-price-feats li.dim { color: var(--foreground-muted); }
.lp-price-feats li.dim svg { color: var(--foreground-muted); }

/* ── Testimonials ── */
.lp-testi { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; max-width: 940px; margin: 40px auto 0; }
.lp-testi-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 22px; text-align: left; }
.lp-testi-stars { display: flex; gap: 2px; color: var(--warning); margin-bottom: 13px; }
.lp-testi-text { font-size: 13.5px; line-height: 1.6; color: var(--foreground-secondary); margin-bottom: 16px; }
.lp-testi-author { display: flex; align-items: center; gap: 10px; }
.lp-testi-av { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; flex-shrink: 0; }
.lp-testi-name { font-size: 13px; font-weight: 550; }
.lp-testi-role { font-size: 11.5px; color: var(--foreground-tertiary); }

/* ── CTA ── */
.lp-cta { text-align: center; position: relative; overflow: hidden; background: var(--background-secondary); border-top: 1px solid var(--border-subtle); }
.lp-cta-glow { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); width: 620px; max-width: 120vw; height: 340px; background: radial-gradient(ellipse, rgba(109,118,245,0.12) 0%, transparent 66%); pointer-events: none; }
.lp-cta h2 { font-size: clamp(28px, 4vw, 44px); font-weight: 600; letter-spacing: -0.03em; line-height: 1.1; max-width: 540px; margin: 0 auto; position: relative; }
.lp-cta p { margin: 16px auto 0; max-width: 420px; font-size: 16px; color: var(--foreground-secondary); position: relative; }
.lp-cta-actions { margin-top: 26px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; position: relative; }

/* ── Footer ── */
.lp-footer { border-top: 1px solid var(--border-subtle); background: var(--background-secondary); padding: 44px 0 32px; }
.lp-footer-grid { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 40px; padding-bottom: 32px; margin-bottom: 24px; border-bottom: 1px solid var(--border-subtle); }
.lp-footer-brand p { margin-top: 12px; font-size: 13px; line-height: 1.6; color: var(--foreground-tertiary); max-width: 250px; }
.lp-footer-col h4 { font-size: 12px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--foreground-muted); margin-bottom: 13px; }
.lp-footer-col a { display: block; font-size: 13px; color: var(--foreground-tertiary); text-decoration: none; margin-bottom: 8px; transition: color var(--transition-fast); }
.lp-footer-col a:hover { color: var(--foreground); }
.lp-footer-bottom { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; font-size: 12.5px; color: var(--foreground-muted); }

/* ── Responsive ── */
@media (max-width: 900px) {
  .lp-nav-links { display: none; }
  .lp-how { grid-template-columns: 1fr; }
  .lp-feat { grid-template-columns: 1fr 1fr; }
  .lp-feat-lg, .lp-feat-wide { grid-column: span 2; grid-row: auto; }
  .lp-demo-inner { grid-template-columns: 1fr; }
  .lp-price { grid-template-columns: 1fr; max-width: 400px; }
  .lp-testi { grid-template-columns: 1fr; max-width: 440px; }
  .lp-footer-grid { grid-template-columns: 1fr 1fr; }
  .lp-sb { display: none; }
}
@media (max-width: 560px) {
  .lp-feat { grid-template-columns: 1fr; }
  .lp-feat-lg, .lp-feat-wide { grid-column: span 1; }
  .lp-form-grid { grid-template-columns: 1fr; }
  .lp-stat { border-right: none; border-bottom: 1px solid var(--border-subtle); }
  .lp-stat:last-child { border-bottom: none; }
  .lp-footer-grid { grid-template-columns: 1fr; }
  .lp-nav-cta .btn:first-child { display: none; }
}
`

const HERO_FIELDS = [
  { id: 'fname', label: 'First name', val: 'Sarah' },
  { id: 'lname', label: 'Last name', val: 'Chen' },
  { id: 'email', label: 'Email', val: 'sarah.chen@vercel.com' },
  { id: 'phone', label: 'Phone', val: '+1 (415) 820-3341' },
  { id: 'title', label: 'Job title', val: 'VP of Product' },
  { id: 'company', label: 'Company', val: 'Vercel' },
]

const DEMO_STEPS = [
  { n: 'STEP 01', title: 'Copy contact info', desc: 'Grab any text — a LinkedIn profile, an email, a business card scan. No formatting required.', status: 'Copy text to clipboard…', progress: 0, filled: false },
  { n: 'STEP 02', title: 'Press Alt+V on any form', desc: 'TaskPilot detects form fields via 4 label-extraction methods. Works with React, Vue, Angular.', status: 'Alt+V triggered · detecting fields…', progress: 20, filled: false },
  { n: 'STEP 03', title: '3-layer parsing fires', desc: 'Regex → heuristics → AI (only under 70% confidence). Names, emails, titles extracted in ms.', status: 'regex → heuristics · confidence 0.94', progress: 55, filled: false },
  { n: 'STEP 04', title: 'Fields fill instantly', desc: 'Each field lights up as it fills. React and Vue state stays in sync every time.', status: 'Filling 6 fields…', progress: 82, filled: true },
  { n: 'STEP 05', title: 'Review and submit', desc: 'All data mapped. You review, edit if needed, and submit. Seconds instead of minutes.', status: 'Done — 6 fields in 1.8s', progress: 100, filled: true },
]

const DEMO_FIELDS = [
  { label: 'Full name', val: 'Sarah Chen' },
  { label: 'Job title', val: 'VP of Product' },
  { label: 'Company', val: 'Vercel' },
  { label: 'Email', val: 'sarah.chen@vercel.com' },
  { label: 'Phone', val: '+1 (415) 820-3341' },
]

const STATS = [
  { n: '14,200+', l: 'Active users' },
  { n: '4.8M', l: 'AI actions taken' },
  { n: '94k+', l: 'Hours saved' },
  { n: '60%', l: 'Token cost savings' },
  { n: '4.9 / 5', l: 'Chrome Store rating' },
]

const INTEGRATIONS = ['HubSpot', 'Salesforce', 'LinkedIn', 'Gmail', 'Notion', 'Airtable', 'Slack', 'Google Sheets', 'Pipedrive', 'Outlook', 'Shopify', 'Zapier']

const TESTIMONIALS = [
  { text: 'Smart Paste cut my HubSpot data entry from 3 minutes per contact to under 10 seconds. I saved 8+ hours this week alone.', initials: 'MR', name: 'Marc Reynolds', role: 'SDR Lead · Segment', bg: 'rgba(109,118,245,0.16)', color: 'var(--indigo-light)' },
  { text: 'The AI Sidebar is like a research assistant on every tab. I summarize competitor sites and extract pricing without leaving the page.', initials: 'YK', name: 'Yuki Kato', role: 'Product Manager · Linear', bg: 'rgba(52,208,232,0.12)', color: 'var(--cyan-light)' },
  { text: "TaskPilot's extraction and Excel export replaced a custom scraper we paid $400/month to maintain. Across 200+ competitor SKUs.", initials: 'AS', name: 'Alexia Santos', role: 'Growth Lead · GOAT', bg: 'rgba(34,197,94,0.12)', color: '#6ee7a8' },
]

export default function LandingPage() {
  const [heroFilled, setHeroFilled] = useState(0)
  const [aiMsg, setAiMsg] = useState<'typing' | 'found' | 'done'>('typing')
  const [demoStep, setDemoStep] = useState(0)

  useEffect(() => {
    let cancelled = false
    const timeouts: number[] = []
    const at = (fn: () => void, ms: number) => timeouts.push(window.setTimeout(() => !cancelled && fn(), ms))
    const cycle = () => {
      if (cancelled) return
      at(() => setAiMsg('found'), 1300)
      HERO_FIELDS.forEach((_, i) => at(() => setHeroFilled(i + 1), 1700 + i * 240))
      at(() => setAiMsg('done'), 3300)
      at(() => { setHeroFilled(0); setAiMsg('typing'); at(cycle, 1300) }, 5800)
    }
    at(cycle, 1600)
    return () => { cancelled = true; timeouts.forEach(clearTimeout) }
  }, [])

  useEffect(() => {
    const id = setInterval(() => setDemoStep((s) => (s + 1) % DEMO_STEPS.length), 2600)
    return () => clearInterval(id)
  }, [])

  const step = DEMO_STEPS[demoStep]

  return (
    <div className="lp">
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {/* NAV */}
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <a href="/" className="lp-logo">
            <span className="lp-logo-mark"><IconLogo size={16} /></span>
            <span className="lp-logo-name">TaskPilot</span>
          </a>
          <div className="lp-nav-links">
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="/marketplace">Marketplace</a>
          </div>
          <div className="lp-nav-cta">
            <a href="/auth/login" className="btn btn-ghost btn-sm">Sign in</a>
            <a href="/auth/signup" className="btn btn-primary btn-sm"><IconChrome size={15} /> Add to Chrome</a>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <header className="lp-hero">
        <div className="lp-hero-glow" />
        <div className="ui-container">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22 }}>
            <span className="eyebrow"><span className="pulse-dot" /> New — Browser Actions in Phase 3 beta</span>
          </div>
          <h1>The AI Agent for Your <span className="gradient-text">Browser</span></h1>
          <p className="lp-hero-sub">Turn natural language into real browser actions. Fill forms, extract data, generate replies, automate repetitive work, and export results—all from any website.</p>
          <div className="lp-hero-actions">
            <a href="/auth/signup" className="btn btn-primary btn-lg"><IconPlay size={15} /> Add to Chrome — free</a>
            <a href="#demo" className="btn btn-secondary btn-lg">See it in action <IconArrowRight size={15} /></a>
          </div>
          <p className="lp-hero-note">No account needed to start · 30 free AI actions / month</p>

          <Reveal className="lp-mock-wrap">
            <div className="lp-browser">
              <div className="lp-browser-bar">
                <div className="lp-dots"><span /><span /><span /></div>
                <div className="lp-url"><IconLock size={11} /> app.hubspot.com/contacts/create</div>
              </div>
              <div className="lp-browser-body">
                <div className="lp-crm-head">
                  <div className="lp-crm-logo">H</div>
                  <div><div className="lp-crm-title">Create Contact</div><div className="lp-crm-sub">HubSpot CRM</div></div>
                </div>
                <div className="lp-form-grid">
                  {HERO_FIELDS.map((f, i) => (
                    <div className="lp-field" key={f.id}>
                      <label>{f.label}</label>
                      <div className={`lp-input ${i < heroFilled ? 'filled' : 'empty'}`}>{i < heroFilled ? f.val : f.label}</div>
                    </div>
                  ))}
                </div>
                <div className="lp-sb">
                  <div className="lp-sb-head">
                    <div className="lp-sb-logo"><span className="lp-sb-mark"><IconLogo size={11} /></span><span className="lp-sb-name">TaskPilot</span></div>
                    <IconArrowRight size={13} style={{ color: 'var(--foreground-muted)' }} />
                  </div>
                  <div className="lp-sb-body">
                    <div className="lp-msg user"><span className="lp-av"><IconZap size={12} /></span><div className="lp-bubble">Smart Paste</div></div>
                    <div className="lp-msg ai">
                      <span className="lp-av"><IconLogo size={12} /></span>
                      <div className="lp-bubble">
                        {aiMsg === 'typing' && <div className="lp-typing"><span /><span /><span /></div>}
                        {aiMsg === 'found' && 'Found 6 fields — filling now…'}
                        {aiMsg === 'done' && (<>Done. 6 fields filled in 1.8s<div className="lp-chip-row"><span className="lp-chip">Copy</span><span className="lp-chip">Undo</span></div></>)}
                      </div>
                    </div>
                  </div>
                  <div className="lp-sb-input"><input placeholder="Ask anything…" readOnly /></div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </header>

      {/* STATS */}
      <div className="lp-stats">
        <div className="ui-container" style={{ paddingInline: 0 }}>
          <div className="lp-stats-inner">
            {STATS.map((s) => (
              <div className="lp-stat" key={s.l}>
                <div className="lp-stat-n">{s.n}</div>
                <div className="lp-stat-l">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* HOW IT WORKS */}
      <section id="how" className="ui-section">
        <div className="ui-container">
          <Reveal>
            <div style={{ textAlign: 'center', maxWidth: 620, margin: '0 auto' }}>
              <span className="eyebrow">How it works</span>
              <h2 style={{ fontSize: 'clamp(26px,3.4vw,38px)', fontWeight: 600, letterSpacing: '-0.025em', marginTop: 16 }}>Three phases. One browser layer.</h2>
              <p style={{ marginTop: 14, fontSize: 16, color: 'var(--foreground-secondary)', lineHeight: 1.6 }}>From instant form-fill to full automation — TaskPilot works in layers, each more capable than the last.</p>
            </div>
          </Reveal>
          <Reveal delay={1}>
            <div className="lp-how">
              {[
                { icon: <IconZap size={19} />, color: 'var(--indigo-light)', bg: 'rgba(109,118,245,0.12)', phase: '01 · PHASE 1', title: 'Smart Paste', body: "Copy any text and press Alt+V. TaskPilot's 3-layer parser maps it to every field with 95%+ accuracy across HubSpot, Salesforce, Gmail and 50+ apps." },
                { icon: <IconSidebar size={19} />, color: 'var(--cyan-light)', bg: 'rgba(52,208,232,0.1)', phase: '02 · PHASE 2', title: 'AI Sidebar', body: 'A floating copilot on every tab. Summarize, translate, extract emails and prices, draft replies, or export to Excel — without leaving the page.' },
                { icon: <IconBot size={19} />, color: 'var(--violet)', bg: 'rgba(167,139,250,0.1)', phase: '03 · PHASE 3', title: 'Browser Actions', body: 'Delegate whole workflows: "Save these leads to HubSpot." "Export this catalog to Excel." TaskPilot plans the steps, runs them, and shows the result.' },
              ].map((c) => (
                <div className="ui-card ui-card-hover" key={c.title}>
                  <div className="lp-how-icon" style={{ background: c.bg, color: c.color }}>{c.icon}</div>
                  <div className="lp-phase">{c.phase}</div>
                  <h3>{c.title}</h3>
                  <p>{c.body}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="ui-section" style={{ background: 'var(--background-secondary)', borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="ui-container">
          <Reveal>
            <div style={{ textAlign: 'center', maxWidth: 620, margin: '0 auto' }}>
              <span className="eyebrow">Features</span>
              <h2 style={{ fontSize: 'clamp(26px,3.4vw,38px)', fontWeight: 600, letterSpacing: '-0.025em', marginTop: 16 }}>Everything your browser should already do.</h2>
            </div>
          </Reveal>
          <Reveal delay={1}>
            <div className="lp-feat">
              <div className="ui-card lp-feat-lg" style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(109,118,245,0.12)', color: 'var(--indigo-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><IconZap size={19} /></div>
                <span className="badge badge-indigo" style={{ alignSelf: 'flex-start', marginBottom: 12 }}>Smart Paste</span>
                <h3 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 8 }}>95%+ accuracy on any form</h3>
                <p style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--foreground-secondary)' }}>Three parsing layers — regex, heuristics, then AI only when needed. Recognizes names, emails, phones, titles, companies, addresses and social handles. Works with React, Vue and Angular controlled inputs.</p>
                <div className="lp-code">
                  <div style={{ color: 'var(--foreground-muted)', marginBottom: 8 }}>{'// 3-layer parse result'}</div>
                  <div><span style={{ color: 'var(--indigo-light)' }}>layer</span>: <span style={{ color: 'var(--cyan-light)' }}>&quot;regex → heuristics&quot;</span></div>
                  <div><span style={{ color: 'var(--indigo-light)' }}>confidence</span>: <span style={{ color: '#6ee7a8' }}>0.94</span></div>
                  <div><span style={{ color: 'var(--indigo-light)' }}>aiUsed</span>: <span style={{ color: 'var(--warning)' }}>false</span></div>
                  <div><span style={{ color: 'var(--indigo-light)' }}>company</span>: <span style={{ color: 'var(--cyan-light)' }}>&quot;Vercel&quot;</span></div>
                </div>
              </div>

              <FeatureBox icon={<IconTable size={19} />} color="var(--cyan-light)" bg="rgba(52,208,232,0.1)" tag="Extraction" tagTone="cyan" title="Scrape anything" body="Emails, phones, prices, products, links, tables — structured and exported to CSV, Excel or JSON in one click." />
              <FeatureBox icon={<IconMail size={19} />} color="#6ee7a8" bg="rgba(34,197,94,0.1)" tag="AI writing" tagTone="success" title="Generate replies" body="Reads the thread and drafts a reply in your tone — formal, concise or casual. You review before sending." />
              <FeatureBox icon={<IconGlobe size={19} />} color="var(--violet)" bg="rgba(167,139,250,0.1)" tag="Language" tagTone="indigo" title="Translate any page" body="Instant full-page translation to 40+ languages, rendered inline without losing context or layout." />

              <div className="ui-card lp-feat-wide">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22, alignItems: 'center' }}>
                  <div>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(245,158,11,0.1)', color: 'var(--warning)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><IconGauge size={19} /></div>
                    <span className="badge badge-neutral" style={{ marginBottom: 12 }}>Performance</span>
                    <h3 style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 8 }}>60% token cost savings</h3>
                    <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--foreground-secondary)' }}>Semantic caching, heuristic-first routing, and per-task token limits. Typical cost: $0.00015 per request.</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[['Heuristic routing', '40% requests', 'var(--success)'], ['Semantic cache hits', '34%+ rate', 'var(--cyan-light)'], ['Default model', 'gpt-4.1-mini', 'var(--indigo-light)'], ['Avg cost / request', '$0.00015', 'var(--warning)']].map(([l, v, c]) => (
                      <div className="lp-metric" key={l}><span className="lp-metric-l">{l}</span><span className="lp-metric-v" style={{ color: c }}>{v}</span></div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* DEMO */}
      <section id="demo" className="ui-section">
        <div className="ui-container">
          <Reveal>
            <div style={{ textAlign: 'center', maxWidth: 620, margin: '0 auto' }}>
              <span className="eyebrow">Live demo</span>
              <h2 style={{ fontSize: 'clamp(26px,3.4vw,38px)', fontWeight: 600, letterSpacing: '-0.025em', marginTop: 16 }}>Watch it work.</h2>
              <p style={{ marginTop: 14, fontSize: 16, color: 'var(--foreground-secondary)', lineHeight: 1.6 }}>Smart Paste turns unstructured clipboard text into filled form fields in under two seconds.</p>
            </div>
          </Reveal>
          <div className="lp-demo-inner">
            <Reveal className="lp-steps">
              {DEMO_STEPS.map((s, i) => (
                <div key={s.n} className={`lp-step ${i === demoStep ? 'active' : ''}`} onClick={() => setDemoStep(i)}>
                  <div className="lp-step-n">{s.n}</div>
                  <h4>{s.title}</h4>
                  <p>{s.desc}</p>
                </div>
              ))}
            </Reveal>
            <Reveal delay={1}>
              <div className="lp-preview">
                <div className="lp-preview-head"><div className="lp-dots"><span /><span /><span /></div><span style={{ fontFamily: 'var(--font-code)', fontSize: 10.5, color: 'var(--foreground-muted)' }}>hubspot.com/contacts/create</span></div>
                <div className="lp-preview-body">
                  <div className="lp-clip">
                    <div className="lp-clip-head"><IconLock size={10} /> Clipboard</div>
                    Sarah Chen · VP of Product at Vercel<br />sarah.chen@vercel.com · +1 (415) 820-3341
                  </div>
                  <div className="lp-mini">
                    {DEMO_FIELDS.map((f) => (
                      <div className={`lp-mini-row ${step.filled ? 'filled' : ''}`} key={f.label}>
                        <div className="lp-mini-l">{f.label}</div>
                        <div className="lp-mini-v">{step.filled ? f.val : '—'}</div>
                      </div>
                    ))}
                  </div>
                  <div className="lp-progress"><div className="lp-progress-fill" style={{ width: `${step.progress}%` }} /></div>
                  <div className="lp-demo-status">{step.status}</div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* INTEGRATIONS */}
      <section className="ui-section-tight" style={{ background: 'var(--background-secondary)', borderTop: '1px solid var(--border-subtle)', textAlign: 'center' }}>
        <div className="ui-container">
          <Reveal>
            <span className="eyebrow">Integrations</span>
            <h2 style={{ fontSize: 'clamp(22px,3vw,32px)', fontWeight: 600, letterSpacing: '-0.02em', marginTop: 14 }}>Works everywhere you work.</h2>
            <p style={{ marginTop: 12, fontSize: 14.5, color: 'var(--foreground-tertiary)' }}>Smart Paste and extraction work on any site. Push to CRMs and tools with Pro.</p>
            <div className="lp-int">
              {INTEGRATIONS.map((n) => <span className="lp-pill" key={n}>{n}</span>)}
              <span className="lp-pill accent">+40 more</span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="ui-section">
        <div className="ui-container">
          <Reveal>
            <div style={{ textAlign: 'center', maxWidth: 620, margin: '0 auto' }}>
              <span className="eyebrow">Pricing</span>
              <h2 style={{ fontSize: 'clamp(26px,3.4vw,38px)', fontWeight: 600, letterSpacing: '-0.025em', marginTop: 16 }}>Start free. Scale when you&apos;re ready.</h2>
              <p style={{ marginTop: 14, fontSize: 16, color: 'var(--foreground-secondary)', lineHeight: 1.6 }}>No card required to start. Pro unlocks unlimited AI, all integrations and browser automation.</p>
            </div>
          </Reveal>
          <Reveal delay={1}>
            <div className="lp-price">
              <PriceCard name="Free" amount={<>$0</>} per="Forever free" cta="Get started" href="/auth/signup" feats={[['30 AI actions / month', 1], ['Smart Paste on all sites', 1], ['AI Sidebar (basic)', 1], ['CSV export (5 / month)', 1], ['CRM integrations', 0], ['Browser Actions', 0]]} />
              <PriceCard featured name="Pro" amount={<><sup>$</sup>19</>} per="per month · $190/yr" cta="Start 7-day trial" href="/auth/signup?plan=pro" feats={[['Unlimited AI actions', 1], ['Advanced field mapping', 1], ['Full AI Sidebar', 1], ['Unlimited exports', 1], ['HubSpot + Notion', 1], ['Browser Actions', 1], ['Priority support', 1]]} />
              <PriceCard name="Enterprise" amount={<span style={{ fontSize: 26 }}>Custom</span>} per="Volume pricing" cta="Contact sales" href="mailto:hello@taskpilot.cc" feats={[['Everything in Pro', 1], ['SSO / SAML', 1], ['Team management', 1], ['REST API access', 1], ['Custom model routing', 1], ['SLA + security review', 1]]} />
            </div>
          </Reveal>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="ui-section" style={{ background: 'var(--background-secondary)', borderTop: '1px solid var(--border-subtle)' }}>
        <div className="ui-container">
          <Reveal>
            <div style={{ textAlign: 'center', maxWidth: 620, margin: '0 auto' }}>
              <span className="eyebrow">Testimonials</span>
              <h2 style={{ fontSize: 'clamp(24px,3.2vw,34px)', fontWeight: 600, letterSpacing: '-0.025em', marginTop: 16 }}>Trusted by people who live in their browser.</h2>
            </div>
          </Reveal>
          <Reveal delay={1}>
            <div className="lp-testi">
              {TESTIMONIALS.map((t) => (
                <div className="lp-testi-card" key={t.initials}>
                  <div className="lp-testi-stars">{[0, 1, 2, 3, 4].map((i) => <IconStar key={i} size={13} />)}</div>
                  <p className="lp-testi-text">{t.text}</p>
                  <div className="lp-testi-author">
                    <div className="lp-testi-av" style={{ background: t.bg, color: t.color }}>{t.initials}</div>
                    <div><div className="lp-testi-name">{t.name}</div><div className="lp-testi-role">{t.role}</div></div>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* CTA */}
      <section className="lp-cta ui-section">
        <div className="lp-cta-glow" />
        <div className="ui-container">
          <Reveal>
            <div style={{ marginBottom: 20, position: 'relative' }}><span className="eyebrow">Get started today</span></div>
            <h2>Your browser, finally <span className="gradient-text">working for you.</span></h2>
            <p>Join 14,200+ people who stopped doing manual browser work. Free forever, no card required.</p>
            <div className="lp-cta-actions">
              <a href="/auth/signup" className="btn btn-primary btn-lg"><IconChrome size={15} /> Add to Chrome — free</a>
              <a href="#features" className="btn btn-secondary btn-lg">Explore features</a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="lp-footer">
        <div className="ui-container">
          <div className="lp-footer-grid">
            <div className="lp-footer-brand">
              <a href="/" className="lp-logo"><span className="lp-logo-mark"><IconLogo size={16} /></span><span className="lp-logo-name">TaskPilot</span></a>
              <p>The AI operating layer for the browser. Autofill, extract and automate — on any webpage, instantly.</p>
            </div>
            <div className="lp-footer-col"><h4>Product</h4><a href="#features">Features</a><a href="#pricing">Pricing</a><a href="/changelog">Changelog</a><a href="/roadmap">Roadmap</a></div>
            <div className="lp-footer-col"><h4>Company</h4><a href="/about">About</a><a href="/blog">Blog</a><a href="/careers">Careers</a></div>
            <div className="lp-footer-col"><h4>Legal</h4><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/security">Security</a></div>
          </div>
          <div className="lp-footer-bottom">
            <span>© {new Date().getFullYear()} TaskPilot, Inc.</span>
            <span>Built with Next.js · Supabase · Upstash</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

function FeatureBox({ icon, color, bg, tag, tagTone, title, body }: { icon: React.ReactNode; color: string; bg: string; tag: string; tagTone: 'indigo' | 'cyan' | 'success'; title: string; body: string }) {
  return (
    <div className="ui-card ui-card-hover">
      <div style={{ width: 38, height: 38, borderRadius: 10, background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>{icon}</div>
      <span className={`badge badge-${tagTone}`} style={{ marginBottom: 10 }}>{tag}</span>
      <h3 style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 6 }}>{title}</h3>
      <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--foreground-secondary)' }}>{body}</p>
    </div>
  )
}

function PriceCard({ name, amount, per, cta, href, feats, featured }: { name: string; amount: React.ReactNode; per: string; cta: string; href: string; feats: [string, number][]; featured?: boolean }) {
  return (
    <div className={`lp-price-card ${featured ? 'feat' : ''}`}>
      {featured && <div className="lp-price-badge">Most popular</div>}
      <div className="lp-price-name">{name}</div>
      <div className="lp-price-amt">{amount}</div>
      <div className="lp-price-per">{per}</div>
      <div className="lp-price-div" />
      <ul className="lp-price-feats">
        {feats.map(([label, on]) => (
          <li key={label} className={on ? '' : 'dim'}><IconCheck size={15} /> {label}</li>
        ))}
      </ul>
      <a href={href} className={`btn ${featured ? 'btn-primary' : 'btn-secondary'}`} style={{ width: '100%' }}>{cta}</a>
    </div>
  )
}
