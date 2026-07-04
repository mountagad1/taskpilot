// ============================================================
// TASKPILOT — LANDING PAGE
// apps/web/src/app/page.tsx
// ============================================================

'use client'

import { useEffect, useState } from 'react'

const css = `
:root{
  --bg:#05050f;
  --bg2:#08081a;
  --bg3:#0c0c22;
  --s1:rgba(255,255,255,.04);
  --s2:rgba(255,255,255,.07);
  --s3:rgba(255,255,255,.11);
  --b1:rgba(255,255,255,.07);
  --b2:rgba(255,255,255,.12);
  --b3:rgba(255,255,255,.2);
  --fg:#eeeeff;
  --fg2:rgba(238,238,255,.6);
  --fg3:rgba(238,238,255,.35);
  --fg4:rgba(238,238,255,.18);
  --in:#6366f1;
  --inl:#818cf8;
  --ind:#4f46e5;
  --cy:#22d3ee;
  --cyl:#67e8f9;
  --vi:#a78bfa;
  --gr:#10b981;
  --am:#f59e0b;
  --rd:#ef4444;
  --grad:linear-gradient(135deg,#6366f1,#22d3ee);
}
body{
  background:var(--bg);
  color:var(--fg);
}
body::before{
  content:'';
  position:fixed;inset:0;
  background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.035'/%3E%3C/svg%3E");
  pointer-events:none;z-index:0;opacity:.5;
}

/* ── NAV ──────────────────── */
.lp-nav{
  position:fixed;top:0;left:0;right:0;z-index:100;
  padding:0 5%;
  display:flex;align-items:center;justify-content:space-between;
  height:62px;
  background:rgba(5,5,15,.7);
  border-bottom:1px solid var(--b1);
  backdrop-filter:blur(18px);
  -webkit-backdrop-filter:blur(18px);
}
.nav-logo{display:flex;align-items:center;gap:10px;text-decoration:none}
.nav-mark{
  width:30px;height:30px;border-radius:8px;
  background:var(--grad);
  display:flex;align-items:center;justify-content:center;
  font-size:14px;font-weight:800;color:#fff;font-family:var(--font-heading);
}
.nav-name{font-family:var(--font-heading);font-weight:700;font-size:16px;color:var(--fg)}
.nav-links{display:flex;align-items:center;gap:28px}
.nav-links a{
  text-decoration:none;font-size:13.5px;font-weight:500;
  color:var(--fg3);transition:color .15s;
}
.nav-links a:hover{color:var(--fg)}
.nav-cta{display:flex;align-items:center;gap:10px}
.btn-ghost{
  padding:7px 16px;border-radius:8px;
  border:1px solid var(--b2);background:transparent;
  color:var(--fg2);font-family:var(--font-heading);font-size:13px;font-weight:600;
  cursor:pointer;transition:all .15s;text-decoration:none;
}
.btn-ghost:hover{background:var(--s2);border-color:var(--b3);color:var(--fg)}
.btn-primary{
  padding:7px 18px;border-radius:8px;
  background:var(--grad);border:none;
  color:#fff;font-family:var(--font-heading);font-size:13px;font-weight:600;
  cursor:pointer;transition:all .2s;text-decoration:none;
  box-shadow:0 0 20px rgba(99,102,241,.3);
}
.btn-primary:hover{transform:translateY(-1px);box-shadow:0 0 30px rgba(99,102,241,.45)}

/* ── HERO ─────────────────── */
.hero{
  min-height:100vh;
  display:flex;align-items:center;justify-content:center;
  flex-direction:column;
  text-align:center;
  padding:120px 5% 80px;
  position:relative;
}
.hero-glow{
  position:absolute;
  top:15%;left:50%;transform:translateX(-50%);
  width:700px;height:500px;
  background:radial-gradient(ellipse at center,rgba(99,102,241,.12) 0%,transparent 65%);
  pointer-events:none;
}
.hero-glow2{
  position:absolute;
  top:30%;left:20%;
  width:400px;height:300px;
  background:radial-gradient(ellipse at center,rgba(34,211,238,.07) 0%,transparent 65%);
  pointer-events:none;
}
.hero-badge{
  display:inline-flex;align-items:center;gap:7px;
  padding:5px 14px;border-radius:999px;
  background:rgba(99,102,241,.1);
  border:1px solid rgba(99,102,241,.25);
  font-family:var(--font-heading);font-size:11.5px;font-weight:600;
  color:var(--inl);letter-spacing:.04em;
  margin-bottom:28px;
  position:relative;z-index:1;
}
.badge-dot{width:6px;height:6px;border-radius:50%;background:var(--gr);animation:lp-pulse 2s ease-in-out infinite}
@keyframes lp-pulse{0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,.4)}50%{box-shadow:0 0 0 6px rgba(16,185,129,0)}}
.hero h1{
  font-family:var(--font-heading);font-weight:800;
  font-size:clamp(44px,7vw,84px);
  line-height:1.06;letter-spacing:-.03em;
  max-width:820px;
  position:relative;z-index:1;
  margin-bottom:20px;
}
.hero h1 .line2{
  background:var(--grad);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
}
.hero-sub{
  font-size:clamp(16px,2vw,20px);font-weight:400;
  color:var(--fg2);max-width:540px;line-height:1.65;
  position:relative;z-index:1;margin-bottom:40px;
}
.hero-actions{
  display:flex;align-items:center;gap:14px;flex-wrap:wrap;justify-content:center;
  position:relative;z-index:1;margin-bottom:60px;
}
.btn-large{
  padding:13px 28px;border-radius:11px;font-family:var(--font-heading);
  font-size:15px;font-weight:700;cursor:pointer;transition:all .2s;
  text-decoration:none;display:inline-flex;align-items:center;gap:8px;
}
.btn-large.primary{
  background:var(--grad);color:#fff;border:none;
  box-shadow:0 0 30px rgba(99,102,241,.35);
}
.btn-large.primary:hover{transform:translateY(-2px);box-shadow:0 0 45px rgba(99,102,241,.5)}
.btn-large.secondary{
  background:var(--s1);color:var(--fg);
  border:1px solid var(--b2);
}
.btn-large.secondary:hover{background:var(--s2);border-color:var(--b3)}
.hero-note{font-size:12px;color:var(--fg4);margin-top:-8px;position:relative;z-index:1;margin-bottom:60px}

/* ── BROWSER MOCKUP ───────── */
.browser-wrap{
  width:100%;max-width:900px;
  position:relative;z-index:1;
  margin:0 auto;
}
.browser{
  background:var(--bg2);
  border:1px solid var(--b2);
  border-radius:14px;overflow:hidden;
  box-shadow:0 40px 80px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.05);
}
.browser-bar{
  background:var(--bg3);
  border-bottom:1px solid var(--b1);
  padding:10px 14px;
  display:flex;align-items:center;gap:10px;
}
.browser-dots{display:flex;gap:6px}
.browser-dots span{width:11px;height:11px;border-radius:50%}
.browser-dots span:nth-child(1){background:#ff5f57}
.browser-dots span:nth-child(2){background:#febc2e}
.browser-dots span:nth-child(3){background:#28c840}
.browser-url{
  flex:1;background:var(--s1);border:1px solid var(--b1);
  border-radius:6px;padding:4px 12px;
  font-family:var(--font-code);font-size:11px;
  color:var(--fg3);display:flex;align-items:center;gap:6px;
}
.url-lock{font-size:10px;color:var(--gr)}
.browser-content{padding:24px;min-height:320px;position:relative;text-align:left}

/* ── CRM FORM INSIDE BROWSER ─ */
.crm-header{
  display:flex;align-items:center;gap:10px;margin-bottom:20px;
  padding-bottom:16px;border-bottom:1px solid var(--b1);
}
.crm-logo{
  width:32px;height:32px;border-radius:8px;
  background:linear-gradient(135deg,#ff7a59,#ff4500);
  display:flex;align-items:center;justify-content:center;
  font-size:14px;font-weight:800;color:#fff;font-family:var(--font-heading);
}
.crm-title{font-family:var(--font-heading);font-weight:700;font-size:14px}
.crm-sub{font-size:11px;color:var(--fg3)}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.form-group{display:flex;flex-direction:column;gap:5px}
.form-label{font-size:11px;font-weight:600;color:var(--fg3);font-family:var(--font-heading);letter-spacing:.03em;text-transform:uppercase}
.form-input{
  padding:8px 12px;border-radius:7px;
  background:var(--s1);border:1px solid var(--b1);
  color:var(--fg);font-family:var(--font-body);font-size:13px;
  transition:all .3s;outline:none;width:100%;
}
.form-input.filled{
  border-color:rgba(99,102,241,.5);
  background:rgba(99,102,241,.07);
  color:var(--fg);
  animation:fillGlow .5s ease forwards;
}
@keyframes fillGlow{
  0%{box-shadow:0 0 0 0 rgba(99,102,241,0)}
  40%{box-shadow:0 0 0 4px rgba(99,102,241,.2)}
  100%{box-shadow:0 0 0 0 rgba(99,102,241,0)}
}

/* ── TASKPILOT SIDEBAR ON BROWSER ─ */
.tp-sidebar{
  position:absolute;right:0;top:0;bottom:0;
  width:220px;
  background:rgba(8,8,26,.95);
  border-left:1px solid var(--b2);
  backdrop-filter:blur(20px);
  display:flex;flex-direction:column;
  overflow:hidden;
  animation:slideInSidebar .4s cubic-bezier(.22,1,.36,1) both;
}
@keyframes slideInSidebar{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
.tp-sb-head{
  padding:12px 14px;
  border-bottom:1px solid var(--b1);
  display:flex;align-items:center;justify-content:space-between;
}
.tp-sb-logo{display:flex;align-items:center;gap:6px}
.tp-sb-mark{
  width:20px;height:20px;border-radius:5px;
  background:var(--grad);
  display:flex;align-items:center;justify-content:center;
  font-size:9px;font-weight:800;color:#fff;
}
.tp-sb-name{font-family:var(--font-heading);font-weight:700;font-size:12px}
.tp-sb-close{font-size:11px;color:var(--fg4);cursor:pointer;width:18px;height:18px;display:flex;align-items:center;justify-content:center;border-radius:4px;background:var(--s1)}
.tp-sb-body{flex:1;padding:12px;display:flex;flex-direction:column;gap:8px;overflow:hidden}
.tp-msg{display:flex;gap:6px}
.tp-msg.user{flex-direction:row-reverse}
.tp-avatar{
  width:22px;height:22px;border-radius:6px;flex-shrink:0;
  display:flex;align-items:center;justify-content:center;font-size:10px;
}
.tp-msg.ai .tp-avatar{background:rgba(99,102,241,.2)}
.tp-msg.user .tp-avatar{background:var(--s2)}
.tp-bubble{
  max-width:calc(100% - 30px);
  padding:7px 9px;border-radius:8px;font-size:11px;line-height:1.5;
}
.tp-msg.ai .tp-bubble{background:var(--s1);border:1px solid var(--b1);color:var(--fg2)}
.tp-msg.user .tp-bubble{background:rgba(99,102,241,.15);border:1px solid rgba(99,102,241,.2);color:var(--fg)}
.tp-typing{display:flex;align-items:center;gap:3px;padding:2px 0}
.tp-typing span{width:4px;height:4px;border-radius:50%;background:var(--inl);animation:lp-blink 1.2s ease infinite}
.tp-typing span:nth-child(2){animation-delay:.2s}
.tp-typing span:nth-child(3){animation-delay:.4s}
@keyframes lp-blink{0%,60%,100%{opacity:.3;transform:scale(1)}30%{opacity:1;transform:scale(1.2)}}
.tp-action-btns{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
.tp-action-btn{
  padding:3px 8px;border-radius:5px;font-size:9.5px;
  font-family:var(--font-heading);font-weight:600;
  border:1px solid var(--b1);background:var(--s1);color:var(--fg3);
  cursor:pointer;transition:all .12s;
}
.tp-action-btn:hover{color:var(--inl);border-color:rgba(99,102,241,.3)}
.tp-input-row{
  padding:8px 10px;
  border-top:1px solid var(--b1);
  display:flex;align-items:center;gap:6px;
}
.tp-input{
  flex:1;background:var(--s1);border:1px solid var(--b1);
  border-radius:6px;padding:5px 8px;
  font-size:10.5px;color:var(--fg);
  font-family:var(--font-body);outline:none;
}
.tp-input::placeholder{color:var(--fg4)}
.tp-send{
  width:22px;height:22px;border-radius:6px;
  background:var(--grad);border:none;
  color:#fff;font-size:11px;cursor:pointer;
  display:flex;align-items:center;justify-content:center;
}

/* ── STATS ────────────────── */
.stats{
  padding:40px 5%;
  display:flex;justify-content:center;
  border-top:1px solid var(--b1);border-bottom:1px solid var(--b1);
  background:var(--bg2);
  position:relative;z-index:1;
}
.stats-inner{
  display:flex;align-items:stretch;gap:0;flex-wrap:wrap;justify-content:center;
  width:100%;max-width:1200px;
}
.stat{
  flex:1;min-width:200px;
  padding:24px 16px;text-align:center;
  border-right:1px solid var(--b1);
}
.stat:last-child{border-right:none}
.stat-n{
  font-family:var(--font-heading);font-weight:800;font-size:clamp(26px,2vw,32px);
  background:var(--grad);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
  letter-spacing:-.02em;line-height:1.15;margin-bottom:4px;white-space:nowrap;
}
.stat-l{font-size:12px;color:var(--fg3);font-weight:500;letter-spacing:.02em}

/* ── SECTION COMMON ───────── */
.lp section{padding:100px 5%;position:relative;z-index:1}
.section-label{
  display:inline-flex;align-items:center;gap:6px;
  padding:4px 12px;border-radius:999px;
  background:rgba(99,102,241,.09);border:1px solid rgba(99,102,241,.2);
  font-family:var(--font-heading);font-size:10.5px;font-weight:700;
  color:var(--inl);letter-spacing:.06em;text-transform:uppercase;
  margin-bottom:20px;
}
.section-heading{
  font-family:var(--font-heading);font-weight:800;
  font-size:clamp(32px,5vw,52px);line-height:1.1;
  letter-spacing:-.025em;margin-bottom:16px;
}
.section-sub{
  font-size:17px;color:var(--fg2);max-width:520px;line-height:1.65;
  margin-bottom:56px;
}
.text-center{text-align:center}
.text-center .section-sub{margin-left:auto;margin-right:auto}

/* ── HOW IT WORKS ─────────── */
.how-grid{
  display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));
  gap:2px;
  background:var(--b1);
  border:1px solid var(--b1);border-radius:16px;overflow:hidden;
  max-width:1100px;margin:0 auto;
}
.how-card{
  background:var(--bg);
  padding:36px 32px;
  position:relative;overflow:hidden;
  transition:background .2s;
}
.how-card:hover{background:var(--bg2)}
.how-num{
  font-family:var(--font-code);font-size:11px;font-weight:500;
  color:var(--fg4);letter-spacing:.08em;margin-bottom:16px;
}
.how-icon{
  width:44px;height:44px;border-radius:11px;margin-bottom:16px;
  display:flex;align-items:center;justify-content:center;font-size:20px;
}
.how-card h3{
  font-family:var(--font-heading);font-weight:700;font-size:18px;
  margin-bottom:10px;letter-spacing:-.01em;
}
.how-card p{font-size:14px;color:var(--fg2);line-height:1.65}
.how-card .accent-line{
  position:absolute;top:0;left:0;right:0;height:2px;
  opacity:0;transition:opacity .2s;
}
.how-card:hover .accent-line{opacity:1}

/* ── FEATURES ─────────────── */
.features-wrap{display:grid;grid-template-columns:1fr 1fr;gap:24px;max-width:1100px;margin:0 auto}
.feature-card{
  background:var(--s1);border:1px solid var(--b1);
  border-radius:16px;padding:32px;
  transition:all .2s;position:relative;overflow:hidden;
}
.feature-card:hover{background:var(--s2);border-color:var(--b2);transform:translateY(-2px)}
.feature-card.large{grid-column:span 2;display:grid;grid-template-columns:1fr 1fr;gap:32px;align-items:center}
.feature-icon{
  width:48px;height:48px;border-radius:12px;margin-bottom:20px;
  display:flex;align-items:center;justify-content:center;font-size:22px;
}
.feature-tag{
  display:inline-flex;padding:3px 10px;border-radius:999px;
  font-family:var(--font-heading);font-size:10px;font-weight:700;
  letter-spacing:.05em;margin-bottom:12px;
}
.feature-card h3{
  font-family:var(--font-heading);font-weight:700;font-size:19px;
  margin-bottom:10px;letter-spacing:-.01em;
}
.feature-card p{font-size:14px;color:var(--fg2);line-height:1.7}
.feature-glow{
  position:absolute;width:200px;height:200px;border-radius:50%;
  pointer-events:none;opacity:0;transition:opacity .3s;
  filter:blur(40px);
}
.feature-card:hover .feature-glow{opacity:1}
.code-block{
  background:var(--bg3);border:1px solid var(--b1);border-radius:12px;
  padding:20px;font-family:var(--font-code);font-size:11.5px;line-height:1.8;
}
.metric-row{
  display:flex;align-items:center;justify-content:space-between;
  padding:10px 14px;background:var(--s1);border:1px solid var(--b1);border-radius:9px;
}
.metric-label{font-size:12.5px;color:var(--fg3)}
.metric-val{font-family:var(--font-code);font-size:11px}

/* ── DEMO SECTION ─────────── */
.demo-section{background:var(--bg2);border-top:1px solid var(--b1);border-bottom:1px solid var(--b1)}
.demo-inner{max-width:1000px;margin:0 auto;display:grid;grid-template-columns:1fr 1.2fr;gap:48px;align-items:start}
.demo-steps{display:flex;flex-direction:column;gap:4px;text-align:left}
.demo-step{
  padding:18px 20px;border-radius:12px;cursor:pointer;
  border:1px solid transparent;transition:all .2s;
  position:relative;
}
.demo-step.active{background:var(--s2);border-color:rgba(99,102,241,.25)}
.demo-step-num{
  font-family:var(--font-code);font-size:10px;font-weight:500;
  color:var(--fg4);margin-bottom:5px;
}
.demo-step.active .demo-step-num{color:var(--inl)}
.demo-step h4{
  font-family:var(--font-heading);font-weight:600;font-size:14px;
  margin-bottom:4px;color:var(--fg2);
}
.demo-step.active h4{color:var(--fg)}
.demo-step p{font-size:12.5px;color:var(--fg4);line-height:1.55;display:none}
.demo-step.active p{display:block;color:var(--fg3)}
.demo-step::before{
  content:'';position:absolute;left:0;top:20%;bottom:20%;
  width:2px;border-radius:1px;background:var(--in);
  opacity:0;transition:opacity .2s;
}
.demo-step.active::before{opacity:1}

.demo-preview{
  background:var(--bg3);border:1px solid var(--b2);border-radius:14px;
  overflow:hidden;position:sticky;top:90px;text-align:left;
}
.demo-preview-head{
  padding:10px 14px;border-bottom:1px solid var(--b1);
  background:var(--bg2);display:flex;align-items:center;gap:8px;
}
.demo-preview-dots{display:flex;gap:5px}
.demo-preview-dots span{width:9px;height:9px;border-radius:50%}
.demo-preview-dots span:nth-child(1){background:#ff5f57}
.demo-preview-dots span:nth-child(2){background:#febc2e}
.demo-preview-dots span:nth-child(3){background:#28c840}
.demo-preview-url{flex:1;font-family:var(--font-code);font-size:10px;color:var(--fg4)}
.demo-preview-body{padding:20px}
.clipboard-card{
  background:var(--s1);border:1px solid var(--b1);border-radius:10px;
  padding:14px;margin-bottom:14px;font-size:12px;line-height:1.6;
  color:var(--fg3);font-family:var(--font-code);
}
.clipboard-card .clip-head{
  font-family:var(--font-heading);font-size:10px;font-weight:600;
  color:var(--fg4);letter-spacing:.06em;margin-bottom:8px;text-transform:uppercase;
}
.mini-form{display:flex;flex-direction:column;gap:8px}
.mini-field{
  display:flex;align-items:center;gap:8px;
  padding:7px 10px;border-radius:7px;
  background:var(--s1);border:1px solid var(--b1);
  transition:all .3s;
}
.mini-field-label{font-size:10px;font-weight:600;font-family:var(--font-heading);color:var(--fg4);width:60px;flex-shrink:0}
.mini-field-val{font-size:11.5px;color:var(--fg3)}
.mini-field.filled{border-color:rgba(99,102,241,.45);background:rgba(99,102,241,.08)}
.mini-field.filled .mini-field-val{color:var(--fg)}
.progress-bar{height:2px;background:var(--s2);border-radius:1px;margin-top:12px;overflow:hidden}
.progress-fill{height:100%;background:var(--grad);border-radius:1px;width:0%;transition:width .4s ease}
.demo-status{margin-top:10px;font-size:10.5px;color:var(--fg4);font-family:var(--font-code)}

/* ── PRICING ──────────────── */
.pricing-wrap{
  display:grid;grid-template-columns:repeat(3,1fr);
  gap:16px;max-width:960px;margin:0 auto;
}
.price-card{
  background:var(--s1);border:1px solid var(--b1);
  border-radius:18px;padding:32px 28px;
  position:relative;transition:all .2s;text-align:left;
}
.price-card:hover{background:var(--s2);transform:translateY(-3px)}
.price-card.featured{
  background:rgba(99,102,241,.08);
  border:1px solid rgba(99,102,241,.3);
  transform:scale(1.03);
}
.price-card.featured:hover{transform:scale(1.03) translateY(-3px)}
.featured-badge{
  position:absolute;top:-12px;left:50%;transform:translateX(-50%);
  padding:4px 14px;border-radius:999px;
  background:var(--grad);
  font-family:var(--font-heading);font-size:10.5px;font-weight:700;
  color:#fff;letter-spacing:.04em;white-space:nowrap;
}
.price-name{font-family:var(--font-heading);font-weight:700;font-size:13px;color:var(--fg3);letter-spacing:.06em;text-transform:uppercase;margin-bottom:12px}
.price-amount{
  font-family:var(--font-heading);font-weight:800;font-size:40px;
  letter-spacing:-.03em;line-height:1;margin-bottom:4px;
}
.price-amount sup{font-size:22px;font-weight:600;vertical-align:top;margin-top:6px;margin-right:2px}
.price-per{font-size:12px;color:var(--fg4);margin-bottom:24px}
.price-divider{height:1px;background:var(--b1);margin-bottom:24px}
.price-features{list-style:none;display:flex;flex-direction:column;gap:10px;margin-bottom:28px;padding:0}
.price-features li{display:flex;align-items:flex-start;gap:9px;font-size:13px;color:var(--fg2);line-height:1.45}
.price-features li::before{content:'✓';color:var(--gr);font-weight:700;flex-shrink:0;margin-top:1px}
.price-features li.dim{color:var(--fg4)}
.price-features li.dim::before{color:var(--fg4)}
.price-btn{
  display:block;width:100%;padding:11px;border-radius:9px;
  font-family:var(--font-heading);font-size:13.5px;font-weight:700;
  cursor:pointer;transition:all .2s;border:none;text-align:center;text-decoration:none;
}
.price-btn.outline{background:transparent;border:1px solid var(--b2);color:var(--fg2)}
.price-btn.outline:hover{background:var(--s2);border-color:var(--b3);color:var(--fg)}
.price-btn.grad{background:var(--grad);color:#fff;box-shadow:0 0 20px rgba(99,102,241,.3)}
.price-btn.grad:hover{box-shadow:0 0 30px rgba(99,102,241,.5);transform:translateY(-1px)}

/* ── TESTIMONIALS ─────────── */
.testi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;max-width:960px;margin:0 auto}
.testi-card{
  background:var(--s1);border:1px solid var(--b1);
  border-radius:14px;padding:24px;transition:all .2s;text-align:left;
}
.testi-card:hover{background:var(--s2);border-color:var(--b2)}
.testi-stars{color:#f59e0b;font-size:13px;margin-bottom:14px;letter-spacing:2px}
.testi-text{font-size:14px;color:var(--fg2);line-height:1.65;margin-bottom:18px}
.testi-author{display:flex;align-items:center;gap:10px}
.testi-avatar{
  width:34px;height:34px;border-radius:50%;
  display:flex;align-items:center;justify-content:center;
  font-family:var(--font-heading);font-weight:700;font-size:13px;
  flex-shrink:0;
}
.testi-name{font-family:var(--font-heading);font-weight:600;font-size:13px}
.testi-role{font-size:11.5px;color:var(--fg4)}

/* ── INTEGRATIONS ─────────── */
.integrations-strip{
  display:flex;flex-wrap:wrap;justify-content:center;gap:10px;
  max-width:700px;margin:0 auto;
}
.int-pill{
  padding:8px 16px;border-radius:999px;
  background:var(--s1);border:1px solid var(--b1);
  font-family:var(--font-heading);font-size:12.5px;font-weight:600;
  color:var(--fg2);transition:all .15s;cursor:default;
}
.int-pill:hover{background:var(--s2);border-color:var(--b2);color:var(--fg)}
.int-pill.more{background:rgba(99,102,241,.08);border-color:rgba(99,102,241,.2);color:var(--inl)}

/* ── CTA ──────────────────── */
.cta-section{
  text-align:center;padding:120px 5%;
  background:var(--bg2);
  border-top:1px solid var(--b1);position:relative;overflow:hidden;
}
.cta-glow{
  position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
  width:600px;height:400px;
  background:radial-gradient(ellipse,rgba(99,102,241,.1) 0%,transparent 65%);
  pointer-events:none;
}
.cta-section h2{
  font-family:var(--font-heading);font-weight:800;
  font-size:clamp(32px,5vw,56px);
  letter-spacing:-.03em;line-height:1.1;
  max-width:600px;margin:0 auto 20px;position:relative;z-index:1;
}
.cta-section h2 .grad-text{
  background:var(--grad);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
}
.cta-section p{
  font-size:17px;color:var(--fg2);
  max-width:440px;margin:0 auto 40px;position:relative;z-index:1;
}
.cta-actions{display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;position:relative;z-index:1}

/* ── FOOTER ───────────────── */
.lp-footer{
  padding:48px 5% 36px;
  border-top:1px solid var(--b1);
  background:var(--bg2);
  position:relative;z-index:1;
}
.footer-inner{
  max-width:1100px;margin:0 auto;
  display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:40px;
  padding-bottom:40px;margin-bottom:32px;
  border-bottom:1px solid var(--b1);
}
.footer-brand .nav-logo{margin-bottom:12px;display:inline-flex}
.footer-brand p{font-size:13px;color:var(--fg3);line-height:1.65;max-width:240px}
.footer-col h4{
  font-family:var(--font-heading);font-weight:700;font-size:12px;
  color:var(--fg4);letter-spacing:.07em;text-transform:uppercase;
  margin-bottom:14px;
}
.footer-col a{
  display:block;font-size:13px;color:var(--fg3);text-decoration:none;
  margin-bottom:9px;transition:color .12s;
}
.footer-col a:hover{color:var(--fg)}
.footer-bottom{
  max-width:1100px;margin:0 auto;
  display:flex;align-items:center;justify-content:space-between;
  font-size:12px;color:var(--fg4);flex-wrap:wrap;gap:8px;
}

/* ── SCROLL ANIMATIONS ────── */
.reveal{opacity:0;transform:translateY(20px);transition:opacity .6s ease,transform .6s ease}
.reveal.visible{opacity:1;transform:none}
.reveal-d1{transition-delay:.1s}
.reveal-d2{transition-delay:.2s}

/* ── RESPONSIVE ───────────── */
@media(max-width:900px){
  .features-wrap{grid-template-columns:1fr}
  .feature-card.large{grid-column:span 1;grid-template-columns:1fr}
  .feature-card.wide{grid-column:span 1}
  .feature-card.wide .wide-grid{grid-template-columns:1fr}
  .pricing-wrap{grid-template-columns:1fr;max-width:400px}
  .price-card.featured{transform:none}
  .testi-grid{grid-template-columns:1fr}
  .footer-inner{grid-template-columns:1fr 1fr}
  .demo-inner{grid-template-columns:1fr}
  .how-grid{grid-template-columns:1fr}
  .nav-links{display:none}
  .tp-sidebar{display:none}
}
@media(max-width:600px){
  .form-grid{grid-template-columns:1fr}
  .stats-inner{flex-direction:column}
  .stat{border-right:none;border-bottom:1px solid var(--b1);padding:20px 24px}
  .stat:last-child{border-bottom:none}
  .footer-inner{grid-template-columns:1fr}
}
`

// ─── DATA ────────────────────────────────────────────────────

const HERO_FIELDS = [
  { id: 'fname', label: 'First Name', placeholder: 'First name', val: 'Sarah' },
  { id: 'lname', label: 'Last Name', placeholder: 'Last name', val: 'Chen' },
  { id: 'email', label: 'Email', placeholder: 'Email address', val: 'sarah.chen@vercel.com' },
  { id: 'phone', label: 'Phone', placeholder: 'Phone number', val: '+1 (415) 820-3341' },
  { id: 'title', label: 'Job Title', placeholder: 'Job title', val: 'VP of Product' },
  { id: 'company', label: 'Company', placeholder: 'Company name', val: 'Vercel' },
]

const DEMO_STEPS = [
  {
    num: 'STEP 01',
    title: 'Copy contact info',
    desc: 'Grab any text — LinkedIn profile, email, business card scan, plain text bio. No formatting required.',
    status: 'Copy text to clipboard...',
    progress: 0,
    filled: false,
  },
  {
    num: 'STEP 02',
    title: 'Press Alt+V on any form',
    desc: 'TaskPilot detects form fields via 4 label-extraction methods. Works with React, Vue, Angular forms.',
    status: 'Alt+V triggered · detecting forms...',
    progress: 20,
    filled: false,
  },
  {
    num: 'STEP 03',
    title: '3-layer parsing fires',
    desc: 'Regex → Heuristics → AI (only if confidence < 70%). Emails, phones, names, job titles extracted in milliseconds.',
    status: 'Regex → heuristics → confidence: 0.94 ✓',
    progress: 50,
    filled: false,
  },
  {
    num: 'STEP 04',
    title: 'Fields fill with animation',
    desc: 'Each field lights up with an indigo glow as it fills. React/Vue state syncs correctly every time.',
    status: 'Filling fields with glow animation...',
    progress: 80,
    filled: true,
  },
  {
    num: 'STEP 05',
    title: 'Review and submit',
    desc: 'All data mapped. You review, make any edits, and submit. 5 seconds of work instead of 2 minutes.',
    status: '✓ Done — 6 fields filled in 1.8 seconds',
    progress: 100,
    filled: true,
  },
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
  { n: '4.9 ★', l: 'Chrome Store rating' },
]

const INTEGRATIONS = [
  'HubSpot', 'Salesforce', 'LinkedIn', 'Gmail', 'Notion', 'Airtable',
  'Slack', 'Google Sheets', 'Pipedrive', 'Outlook', 'Shopify', 'Zapier',
]

const TESTIMONIALS = [
  {
    text: '"I source leads from LinkedIn all day. TaskPilot Smart Paste cut my HubSpot data entry from 3 minutes per contact to under 10 seconds. I\'ve saved 8+ hours this week alone."',
    initials: 'MR',
    name: 'Marc Reynolds',
    role: 'SDR Lead · Segment',
    avatarBg: 'rgba(99,102,241,.15)',
    avatarColor: 'var(--inl)',
  },
  {
    text: '"The AI Sidebar is like having a research assistant on every tab. I summarize competitor sites, extract pricing tables to Excel, translate docs — without ever leaving the page."',
    initials: 'YK',
    name: 'Yuki Kato',
    role: 'Product Manager · Linear',
    avatarBg: 'rgba(34,211,238,.1)',
    avatarColor: 'var(--cy)',
  },
  {
    text: '"We run e-commerce price monitoring across 200+ competitor SKUs. TaskPilot\'s data extraction and Excel export replaced a whole custom scraper we were paying $400/month to maintain."',
    initials: 'AS',
    name: 'Alexia Santos',
    role: 'Growth Lead · GOAT',
    avatarBg: 'rgba(16,185,129,.1)',
    avatarColor: 'var(--gr)',
  },
]

// ─── PAGE ────────────────────────────────────────────────────

export default function LandingPage() {
  const [heroFilled, setHeroFilled] = useState(0)
  const [aiMsg, setAiMsg] = useState<'typing' | 'found' | 'done'>('typing')
  const [demoStep, setDemoStep] = useState(0)

  // Hero autofill loop
  useEffect(() => {
    let cancelled = false
    const timeouts: number[] = []

    const schedule = (fn: () => void, ms: number) => {
      timeouts.push(window.setTimeout(() => { if (!cancelled) fn() }, ms))
    }

    const cycle = () => {
      if (cancelled) return
      schedule(() => setAiMsg('found'), 1400)
      HERO_FIELDS.forEach((_, i) => {
        schedule(() => setHeroFilled(i + 1), 1800 + i * 280)
      })
      schedule(() => setAiMsg('done'), 3500)
      schedule(() => {
        setHeroFilled(0)
        setAiMsg('typing')
        schedule(cycle, 1400)
      }, 6000)
    }

    schedule(cycle, 2000)
    return () => {
      cancelled = true
      timeouts.forEach(clearTimeout)
    }
  }, [])

  // Demo auto-advance
  useEffect(() => {
    const id = setInterval(() => setDemoStep((s) => (s + 1) % DEMO_STEPS.length), 2800)
    return () => clearInterval(id)
  }, [])

  // Reveal on scroll
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add('visible')
        })
      },
      { threshold: 0.12 }
    )
    document.querySelectorAll('.reveal').forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [])

  const step = DEMO_STEPS[demoStep]

  return (
    <div className="lp">
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {/* NAV */}
      <nav className="lp-nav">
        <a href="/" className="nav-logo">
          <div className="nav-mark">✦</div>
          <span className="nav-name">TaskPilot</span>
        </a>
        <div className="nav-links">
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#demo">Demo</a>
        </div>
        <div className="nav-cta">
          <a href="/auth/login" className="btn-ghost">Sign in</a>
          <a href="/auth/signup" className="btn-primary">Add to Chrome — Free</a>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="hero-glow" />
        <div className="hero-glow2" />
        <div className="hero-badge"><div className="badge-dot" /> NEW — Browser Actions in Phase 3 Beta</div>
        <h1>Talk to any<br /><span className="line2">webpage instantly.</span></h1>
        <p className="hero-sub">
          Autofill forms, extract data, generate replies, export to Excel — from any tab, with a single AI command.
        </p>
        <div className="hero-actions">
          <a href="/auth/signup" className="btn-large primary">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0Z" fill="rgba(255,255,255,.25)" />
              <path d="M10.5 8L7 5.5v5L10.5 8Z" fill="white" />
            </svg>
            Add to Chrome — It&apos;s free
          </a>
          <a href="#demo" className="btn-large secondary">See it in action →</a>
        </div>
        <p className="hero-note">No account needed to start · 30 free AI actions/month</p>

        {/* Browser mockup */}
        <div className="browser-wrap reveal">
          <div className="browser">
            <div className="browser-bar">
              <div className="browser-dots"><span /><span /><span /></div>
              <div className="browser-url">
                <span className="url-lock">🔒</span>
                app.hubspot.com/contacts/create
              </div>
            </div>
            <div className="browser-content">
              {/* CRM form */}
              <div style={{ maxWidth: 520 }}>
                <div className="crm-header">
                  <div className="crm-logo">H</div>
                  <div>
                    <div className="crm-title">Create Contact</div>
                    <div className="crm-sub">HubSpot CRM</div>
                  </div>
                </div>
                <div className="form-grid">
                  {HERO_FIELDS.map((f, i) => (
                    <div className="form-group" key={f.id}>
                      <label className="form-label">{f.label}</label>
                      <input
                        className={`form-input${i < heroFilled ? ' filled' : ''}`}
                        placeholder={f.placeholder}
                        value={i < heroFilled ? f.val : ''}
                        readOnly
                      />
                    </div>
                  ))}
                </div>
              </div>
              {/* TaskPilot sidebar */}
              <div className="tp-sidebar">
                <div className="tp-sb-head">
                  <div className="tp-sb-logo">
                    <div className="tp-sb-mark">✦</div>
                    <span className="tp-sb-name">TaskPilot</span>
                  </div>
                  <div className="tp-sb-close">✕</div>
                </div>
                <div className="tp-sb-body">
                  <div className="tp-msg user">
                    <div className="tp-avatar">↑</div>
                    <div className="tp-bubble">Smart Paste</div>
                  </div>
                  <div className="tp-msg ai">
                    <div className="tp-avatar">✦</div>
                    <div className="tp-bubble">
                      {aiMsg === 'typing' && (
                        <div className="tp-typing"><span /><span /><span /></div>
                      )}
                      {aiMsg === 'found' && '✦ Found 6 fields — filling now...'}
                      {aiMsg === 'done' && (
                        <>
                          ✦ Done! 6 fields filled in 2s
                          <div className="tp-action-btns">
                            <button className="tp-action-btn">Copy result</button>
                            <button className="tp-action-btn">Undo</button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="tp-input-row">
                  <input className="tp-input" placeholder="Ask anything..." readOnly />
                  <button className="tp-send">→</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* STATS */}
      <div className="stats">
        <div className="stats-inner">
          {STATS.map((s) => (
            <div className="stat" key={s.l}>
              <div className="stat-n">{s.n}</div>
              <div className="stat-l">{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* HOW IT WORKS */}
      <section id="how">
        <div className="text-center reveal">
          <div className="section-label">How it works</div>
          <h2 className="section-heading">Three phases.<br />One browser layer.</h2>
          <p className="section-sub">
            From instant form-fill to full browser automation — TaskPilot works in layers, each more powerful than the last.
          </p>
        </div>
        <div className="how-grid reveal">
          <div className="how-card">
            <div className="accent-line" style={{ background: 'linear-gradient(90deg,#6366f1,#22d3ee)' }} />
            <div className="how-num">01 — PHASE 1</div>
            <div className="how-icon" style={{ background: 'rgba(99,102,241,.12)' }}>⚡</div>
            <h3>Smart Paste</h3>
            <p>
              Copy any text — a LinkedIn bio, business card scan, email signature. Press Alt+V. TaskPilot&apos;s 3-layer
              parser maps it to every form field with 95%+ accuracy. Works on HubSpot, Salesforce, Airtable, Gmail,
              and 50+ apps.
            </p>
          </div>
          <div className="how-card">
            <div className="accent-line" style={{ background: 'linear-gradient(90deg,#22d3ee,#10b981)' }} />
            <div className="how-num">02 — PHASE 2</div>
            <div className="how-icon" style={{ background: 'rgba(34,211,238,.1)' }}>🧠</div>
            <h3>AI Sidebar</h3>
            <p>
              A floating AI copilot that lives on every tab. Ask it to summarize the page, translate it, extract all
              emails and prices, generate a professional reply, or export the data to Excel. No copy-pasting between apps.
            </p>
          </div>
          <div className="how-card">
            <div className="accent-line" style={{ background: 'linear-gradient(90deg,#10b981,#a78bfa)' }} />
            <div className="how-num">03 — PHASE 3</div>
            <div className="how-icon" style={{ background: 'rgba(167,139,250,.1)' }}>🤖</div>
            <h3>Browser Actions</h3>
            <p>
              Delegate entire workflows: &quot;Save all leads from this page to HubSpot.&quot; &quot;Export this product
              catalog to Excel.&quot; TaskPilot plans the steps, executes them, and shows you the result. You just watch.
            </p>
          </div>
        </div>
      </section>

      {/* SMART PASTE DEMO */}
      <section id="demo" className="demo-section">
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div className="text-center reveal" style={{ marginBottom: 56 }}>
            <div className="section-label">Live demo</div>
            <h2 className="section-heading">Watch it work.</h2>
            <p className="section-sub">
              Smart Paste turns unstructured clipboard text into perfectly filled form fields in under 2 seconds.
            </p>
          </div>
          <div className="demo-inner">
            <div className="demo-steps reveal">
              {DEMO_STEPS.map((s, i) => (
                <div
                  key={s.num}
                  className={`demo-step${i === demoStep ? ' active' : ''}`}
                  onClick={() => setDemoStep(i)}
                >
                  <div className="demo-step-num">{s.num}</div>
                  <h4>{s.title}</h4>
                  <p>{s.desc}</p>
                </div>
              ))}
            </div>
            <div className="demo-preview reveal reveal-d2">
              <div className="demo-preview-head">
                <div className="demo-preview-dots"><span /><span /><span /></div>
                <div className="demo-preview-url">hubspot.com/contacts/create</div>
              </div>
              <div className="demo-preview-body">
                <div className="clipboard-card">
                  <div className="clip-head">📋 Clipboard</div>
                  <span>
                    Sarah Chen · VP of Product at Vercel<br />
                    sarah.chen@vercel.com · +1 (415) 820-3341<br />
                    linkedin.com/in/sarahchen
                  </span>
                </div>
                <div className="mini-form">
                  {DEMO_FIELDS.map((f) => (
                    <div className={`mini-field${step.filled ? ' filled' : ''}`} key={f.label}>
                      <div className="mini-field-label">{f.label}</div>
                      <div className="mini-field-val">{step.filled ? f.val : '—'}</div>
                    </div>
                  ))}
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${step.progress}%` }} />
                </div>
                <div className="demo-status">{step.status}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features">
        <div className="text-center reveal" style={{ marginBottom: 56 }}>
          <div className="section-label">Features</div>
          <h2 className="section-heading">Everything your browser<br />should already do.</h2>
        </div>
        <div className="features-wrap reveal">
          <div className="feature-card large">
            <div>
              <div
                className="feature-tag"
                style={{ background: 'rgba(99,102,241,.12)', color: 'var(--inl)', border: '1px solid rgba(99,102,241,.2)' }}
              >
                SMART PASTE
              </div>
              <h3>95%+ accuracy on any form</h3>
              <p style={{ marginBottom: 16 }}>
                Three parsing layers — regex, heuristics, then AI only if needed. Recognizes names, emails, phones,
                job titles, companies, addresses, social handles. Compatible with React, Vue, Angular controlled
                inputs via native input value setter.
              </p>
              <p style={{ fontSize: 12.5, color: 'var(--fg4)', fontFamily: 'var(--font-code)' }}>
                Alt+V on any form → instant autofill
              </p>
            </div>
            <div className="code-block">
              <div style={{ color: 'var(--fg4)', marginBottom: 10 }}>{'// 3-layer parsing result'}</div>
              <div><span style={{ color: 'var(--inl)' }}>layer</span><span style={{ color: 'var(--fg3)' }}>: </span><span style={{ color: 'var(--cy)' }}>&quot;regex → heuristics&quot;</span></div>
              <div><span style={{ color: 'var(--inl)' }}>confidence</span><span style={{ color: 'var(--fg3)' }}>: </span><span style={{ color: 'var(--gr)' }}>0.94</span></div>
              <div><span style={{ color: 'var(--inl)' }}>aiUsed</span><span style={{ color: 'var(--fg3)' }}>: </span><span style={{ color: 'var(--am)' }}>false</span></div>
              <div style={{ marginTop: 8, color: 'var(--fg4)' }}>{'// Fields mapped:'}</div>
              <div><span style={{ color: 'var(--inl)' }}>firstName</span><span style={{ color: 'var(--fg3)' }}>: </span><span style={{ color: 'var(--cy)' }}>&quot;Sarah&quot;</span></div>
              <div><span style={{ color: 'var(--inl)' }}>jobTitle</span><span style={{ color: 'var(--fg3)' }}>: </span><span style={{ color: 'var(--cy)' }}>&quot;VP of Product&quot;</span></div>
              <div><span style={{ color: 'var(--inl)' }}>company</span><span style={{ color: 'var(--fg3)' }}>: </span><span style={{ color: 'var(--cy)' }}>&quot;Vercel&quot;</span></div>
              <div><span style={{ color: 'var(--inl)' }}>email</span><span style={{ color: 'var(--fg3)' }}>: </span><span style={{ color: 'var(--cy)' }}>&quot;sarah@vercel.com&quot;</span></div>
            </div>
          </div>

          <div className="feature-card">
            <div className="feature-glow" style={{ background: 'radial-gradient(rgba(34,211,238,.2),transparent)', top: -20, right: -20 }} />
            <div className="feature-icon" style={{ background: 'rgba(34,211,238,.1)' }}>📊</div>
            <div className="feature-tag" style={{ background: 'rgba(34,211,238,.08)', color: 'var(--cy)', border: '1px solid rgba(34,211,238,.2)' }}>
              EXTRACTION
            </div>
            <h3>Scrape anything</h3>
            <p>
              Emails, phone numbers, prices, products, links, tables — structured and exported to CSV, Excel, or JSON
              in one click.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-glow" style={{ background: 'radial-gradient(rgba(16,185,129,.2),transparent)', top: -20, right: -20 }} />
            <div className="feature-icon" style={{ background: 'rgba(16,185,129,.1)' }}>✍️</div>
            <div className="feature-tag" style={{ background: 'rgba(16,185,129,.08)', color: 'var(--gr)', border: '1px solid rgba(16,185,129,.2)' }}>
              AI WRITING
            </div>
            <h3>Generate replies instantly</h3>
            <p>
              Read the email/LinkedIn/CRM message, get a professional reply in your preferred tone — formal, concise,
              or casual.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-glow" style={{ background: 'radial-gradient(rgba(167,139,250,.2),transparent)', top: -20, right: -20 }} />
            <div className="feature-icon" style={{ background: 'rgba(167,139,250,.1)' }}>🌐</div>
            <div className="feature-tag" style={{ background: 'rgba(167,139,250,.08)', color: 'var(--vi)', border: '1px solid rgba(167,139,250,.2)' }}>
              LANGUAGE
            </div>
            <h3>Translate any page</h3>
            <p>
              Instant full-page translation to 40+ languages. Select text, hit Translate — rendered inline without
              losing context.
            </p>
          </div>

          <div className="feature-card wide" style={{ gridColumn: 'span 1' }}>
            <div className="feature-glow" style={{ background: 'radial-gradient(rgba(99,102,241,.15),transparent)', top: -20, left: '50%' }} />
            <div className="feature-icon" style={{ background: 'rgba(245,158,11,.1)' }}>⚡</div>
            <div className="feature-tag" style={{ background: 'rgba(245,158,11,.08)', color: 'var(--am)', border: '1px solid rgba(245,158,11,.2)' }}>
              PERFORMANCE
            </div>
            <h3>60% token cost savings</h3>
            <p style={{ marginBottom: 16 }}>
              Semantic caching (34%+ hit rate), heuristic-first routing (40% of requests skip AI), per-task token
              limits. Typical cost: $0.00015/request after optimizations.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="metric-row">
                <span className="metric-label">Heuristic routing</span>
                <span className="metric-val" style={{ color: 'var(--gr)' }}>40% requests</span>
              </div>
              <div className="metric-row">
                <span className="metric-label">Semantic cache hits</span>
                <span className="metric-val" style={{ color: 'var(--cy)' }}>34%+ rate</span>
              </div>
              <div className="metric-row">
                <span className="metric-label">Model: gpt-4.1-mini</span>
                <span className="metric-val" style={{ color: 'var(--inl)' }}>default</span>
              </div>
              <div className="metric-row">
                <span className="metric-label">Avg cost / request</span>
                <span className="metric-val" style={{ color: 'var(--am)' }}>$0.00015</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* INTEGRATIONS */}
      <section style={{ textAlign: 'center', padding: '80px 5%', background: 'var(--bg2)', borderTop: '1px solid var(--b1)' }}>
        <div className="reveal">
          <div className="section-label">Integrations</div>
          <h2 className="section-heading" style={{ fontSize: 'clamp(26px,4vw,40px)', marginBottom: 12 }}>
            Works everywhere you work.
          </h2>
          <p style={{ color: 'var(--fg3)', fontSize: 14, marginBottom: 36 }}>
            Smart Paste and data extraction work on any website. Push to CRMs and productivity tools with Pro.
          </p>
          <div className="integrations-strip">
            {INTEGRATIONS.map((name) => (
              <div className="int-pill" key={name}>{name}</div>
            ))}
            <div className="int-pill more">+40 more</div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing">
        <div className="text-center reveal" style={{ marginBottom: 56 }}>
          <div className="section-label">Pricing</div>
          <h2 className="section-heading">Start free. Scale when<br />you&apos;re ready.</h2>
          <p className="section-sub">
            No credit card required to start. Pro unlocks unlimited AI, all integrations, and browser automation.
          </p>
        </div>
        <div className="pricing-wrap reveal">
          <div className="price-card">
            <div className="price-name">Free</div>
            <div className="price-amount">$0</div>
            <div className="price-per">Forever free</div>
            <div className="price-divider" />
            <ul className="price-features">
              <li>30 AI actions per month</li>
              <li>Smart Paste on all sites</li>
              <li>AI Sidebar (basic)</li>
              <li>CSV export (5/month)</li>
              <li className="dim">CRM integrations</li>
              <li className="dim">Browser Actions</li>
              <li className="dim">Workflow builder</li>
            </ul>
            <a href="/auth/signup" className="price-btn outline">Get started free</a>
          </div>
          <div className="price-card featured">
            <div className="featured-badge">MOST POPULAR</div>
            <div className="price-name">Pro</div>
            <div className="price-amount"><sup>$</sup>19</div>
            <div className="price-per">per month · $190/yr (save 17%)</div>
            <div className="price-divider" />
            <ul className="price-features">
              <li>Unlimited AI actions</li>
              <li>Smart Paste + advanced mapping</li>
              <li>Full AI Sidebar</li>
              <li>Unlimited exports (CSV, Excel, JSON)</li>
              <li>HubSpot + Notion integration</li>
              <li>Browser Actions</li>
              <li>Workflow history (90 days)</li>
              <li>Priority support</li>
            </ul>
            <a href="/auth/signup?plan=pro" className="price-btn grad">Start 7-day free trial</a>
          </div>
          <div className="price-card">
            <div className="price-name">Enterprise</div>
            <div className="price-amount" style={{ fontSize: 28, paddingTop: 6 }}>Custom</div>
            <div className="price-per">Volume pricing available</div>
            <div className="price-divider" />
            <ul className="price-features">
              <li>Everything in Pro</li>
              <li>SSO / SAML</li>
              <li>Team management</li>
              <li>REST API access</li>
              <li>Custom AI model routing</li>
              <li>Dedicated Slack support</li>
              <li>SLA + security review</li>
            </ul>
            <a href="mailto:hello@taskpilot.cc" className="price-btn outline">Contact sales</a>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section style={{ background: 'var(--bg2)', borderTop: '1px solid var(--b1)' }}>
        <div className="text-center reveal" style={{ marginBottom: 48 }}>
          <div className="section-label">Testimonials</div>
          <h2 className="section-heading" style={{ fontSize: 'clamp(28px,4vw,44px)' }}>
            Trusted by people who<br />live in their browser.
          </h2>
        </div>
        <div className="testi-grid reveal">
          {TESTIMONIALS.map((t) => (
            <div className="testi-card" key={t.initials}>
              <div className="testi-stars">★★★★★</div>
              <p className="testi-text">{t.text}</p>
              <div className="testi-author">
                <div className="testi-avatar" style={{ background: t.avatarBg, color: t.avatarColor }}>
                  {t.initials}
                </div>
                <div>
                  <div className="testi-name">{t.name}</div>
                  <div className="testi-role">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <div className="cta-glow" />
        <div className="section-label" style={{ marginBottom: 24 }}>Get started today</div>
        <h2>Your browser, finally<br /><span className="grad-text">working for you.</span></h2>
        <p>Join 14,200+ people who stopped doing manual browser work. Free forever, no card required.</p>
        <div className="cta-actions">
          <a href="/auth/signup" className="btn-large primary">Add to Chrome — Free ↗</a>
          <a href="#features" className="btn-large secondary">Explore features</a>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="lp-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <a href="/" className="nav-logo">
              <div className="nav-mark">✦</div>
              <span className="nav-name">TaskPilot</span>
            </a>
            <p>The AI operating layer for the browser. Autofill, extract, automate — on any webpage, instantly.</p>
          </div>
          <div className="footer-col">
            <h4>Product</h4>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="/changelog">Changelog</a>
            <a href="/roadmap">Roadmap</a>
          </div>
          <div className="footer-col">
            <h4>Company</h4>
            <a href="/about">About</a>
            <a href="/blog">Blog</a>
            <a href="/careers">Careers</a>
          </div>
          <div className="footer-col">
            <h4>Legal</h4>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a href="/security">Security</a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} TaskPilot, Inc.</span>
          <span style={{ color: 'var(--fg4)' }}>Built with ✦ Next.js · Supabase · Upstash</span>
        </div>
      </footer>
    </div>
  )
}
