// ============================================================
// TASKPILOT — LANDING PAGE
// apps/web/src/app/page.tsx
// ============================================================

"use client";

import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import {
  Zap, Chrome, ArrowRight, Check, Star, Terminal,
  Database, Globe, FileText, Mail, BarChart2, Shield,
  Command, Layers, Clock, TrendingUp, Users, Lock,
} from "lucide-react";

// ─── ANIMATION VARIANTS ──────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] },
  }),
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

// ─── DATA ────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: Zap,
    title: "Smart Paste",
    desc: "Copy any contact info, click Smart Paste. TaskPilot maps it to form fields with 95%+ accuracy across HubSpot, Salesforce, LinkedIn, and 50+ apps.",
    accent: "#6366f1",
    tag: "Phase 1 — Live",
  },
  {
    icon: Terminal,
    title: "AI Sidebar",
    desc: "A floating AI copilot on every webpage. Summarize, translate, extract data, generate replies, export to Excel — without leaving the page.",
    accent: "#06b6d4",
    tag: "Phase 2",
  },
  {
    icon: Layers,
    title: "Browser Actions",
    desc: "Delegate entire workflows. 'Export all products to Excel.' 'Save leads to HubSpot.' TaskPilot plans and executes — you just watch.",
    accent: "#10b981",
    tag: "Phase 3",
  },
];

const CAPABILITIES = [
  { icon: FileText, label: "Summarize any page" },
  { icon: Globe, label: "Translate instantly" },
  { icon: Database, label: "Extract structured data" },
  { icon: BarChart2, label: "Export to Excel/CSV" },
  { icon: Mail, label: "AI email replies" },
  { icon: Users, label: "CRM sync" },
  { icon: Command, label: "Command palette" },
  { icon: Zap, label: "Smart Paste" },
];

const INTEGRATIONS = [
  "HubSpot", "Salesforce", "Gmail", "LinkedIn", "Notion",
  "Airtable", "Shopify", "Zendesk", "Outlook", "Intercom",
];

const TESTIMONIALS = [
  {
    quote: "TaskPilot cut my data entry time by 80%. Smart Paste alone is worth it.",
    author: "Sarah K.",
    role: "Sales Manager at Stripe",
    avatar: "SK",
  },
  {
    quote: "I use it to extract leads from LinkedIn and push to HubSpot in one click. Magic.",
    author: "Marcus T.",
    role: "Founder at YC Startup",
    avatar: "MT",
  },
  {
    quote: "The AI sidebar is like having a research assistant on every tab.",
    author: "Priya M.",
    role: "Growth at Notion",
    avatar: "PM",
  },
];

const STATS = [
  { value: "12,000+", label: "Active users" },
  { value: "4.2M", label: "Actions automated" },
  { value: "93hrs", label: "Avg. saved/month" },
  { value: "4.9★", label: "Chrome store rating" },
];

const PRICING = [
  {
    name: "Free",
    price: 0,
    period: "",
    description: "Try TaskPilot risk-free",
    features: ["20 AI actions/month", "3 exports", "Smart Paste", "Basic extraction"],
    cta: "Get Started Free",
    href: "/auth/signup",
    accent: false,
  },
  {
    name: "Pro",
    price: 19,
    period: "/month",
    description: "For power users and teams",
    features: [
      "Unlimited AI actions",
      "Unlimited exports",
      "AI Sidebar on all pages",
      "Browser workflows",
      "CRM integrations",
      "Advanced exports (Excel, PDF)",
      "Saved prompts library",
      "Workflow history",
      "Priority support",
    ],
    cta: "Start 7-day free trial",
    href: "/auth/signup?plan=pro",
    accent: true,
    badge: "Most Popular",
  },
  {
    name: "Enterprise",
    price: null,
    period: "",
    description: "For teams and organizations",
    features: [
      "Everything in Pro",
      "SSO & team management",
      "Custom AI models",
      "Admin dashboard",
      "Custom integrations",
      "SLA & dedicated support",
    ],
    cta: "Contact Sales",
    href: "mailto:enterprise@taskpilot.cc",
    accent: false,
  },
];

// ─── DEMO ANIMATION ──────────────────────────────────────────

const DEMO_STEPS = [
  { label: "Copying contact info...", duration: 1200 },
  { label: "Detecting form fields...", duration: 900 },
  { label: "Mapping data (regex + AI)...", duration: 800 },
  { label: "Filling 6 fields...", duration: 600 },
  { label: "✓ Done in 0.8s", duration: 2000 },
];

function SmartPasteDemo() {
  const [step, setStep] = useState(0);
  const [running, setRunning] = useState(false);
  const [filled, setFilled] = useState(false);

  const clipboardText = `John Doe
CEO at Stripe
john@stripe.com
+1 415 555 0193
stripe.com`;

  const fields = [
    { label: "First Name", value: "John", filled: step >= 4 },
    { label: "Last Name", value: "Doe", filled: step >= 4 },
    { label: "Email", value: "john@stripe.com", filled: step >= 4 },
    { label: "Company", value: "Stripe", filled: step >= 4 },
    { label: "Title", value: "CEO", filled: step >= 4 },
    { label: "Phone", value: "+1 415 555 0193", filled: step >= 4 },
  ];

  async function runDemo() {
    if (running) return;
    setRunning(true);
    setFilled(false);
    for (let i = 0; i < DEMO_STEPS.length; i++) {
      setStep(i);
      await new Promise((r) => setTimeout(r, DEMO_STEPS[i].duration));
    }
    setFilled(true);
    setRunning(false);
    setTimeout(() => { setStep(0); setFilled(false); }, 4000);
  }

  return (
    <div className="demo-container">
      <style>{`
        .demo-container { 
          display: grid; 
          grid-template-columns: 1fr 1fr; 
          gap: 20px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px;
          padding: 24px;
          position: relative;
          overflow: hidden;
        }
        .demo-container::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.08) 0%, transparent 70%);
          pointer-events: none;
        }
        .demo-clipboard {
          background: rgba(0,0,0,0.3);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px;
          padding: 16px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          color: #94a3b8;
          line-height: 1.8;
        }
        .demo-form {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .demo-field {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .demo-field label {
          font-size: 10px;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-family: 'Space Grotesk', sans-serif;
        }
        .demo-field input {
          background: rgba(0,0,0,0.3);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 6px;
          padding: 7px 10px;
          font-size: 12px;
          color: #e2e8f0;
          transition: all 0.3s ease;
          outline: none;
          font-family: 'JetBrains Mono', monospace;
        }
        .demo-field input.filled {
          border-color: rgba(99,102,241,0.5);
          background: rgba(99,102,241,0.08);
          box-shadow: 0 0 0 3px rgba(99,102,241,0.1);
        }
        .demo-status {
          grid-column: 1 / -1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 12px;
          border-top: 1px solid rgba(255,255,255,0.06);
        }
        .status-text {
          font-size: 12px;
          color: #6366f1;
          font-family: 'JetBrains Mono', monospace;
        }
        .demo-btn {
          background: linear-gradient(135deg, #6366f1, #818cf8);
          color: white;
          border: none;
          border-radius: 8px;
          padding: 10px 20px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          font-family: 'Space Grotesk', sans-serif;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .demo-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 20px rgba(99,102,241,0.4); }
        .demo-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .demo-label {
          font-size: 10px;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-bottom: 6px;
          font-family: 'Space Grotesk', sans-serif;
        }
      `}</style>

      <div>
        <div className="demo-label">📋 Clipboard</div>
        <div className="demo-clipboard">
          {clipboardText.split("\n").map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      </div>

      <div>
        <div className="demo-label">📝 Form fields</div>
        <div className="demo-form">
          {fields.map((f, i) => (
            <div key={i} className="demo-field">
              <label>{f.label}</label>
              <input
                readOnly
                value={f.filled ? f.value : ""}
                className={f.filled ? "filled" : ""}
                placeholder={`Enter ${f.label.toLowerCase()}...`}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="demo-status">
        <span className="status-text">
          {running && step < DEMO_STEPS.length
            ? `⚡ ${DEMO_STEPS[step].label}`
            : filled
            ? "✓ 6 fields filled in 0.8s — 93% confidence"
            : "Ready"}
        </span>
        <button className="demo-btn" onClick={runDemo} disabled={running}>
          <Zap size={14} />
          {running ? "Processing..." : "Smart Paste"}
        </button>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ───────────────────────────────────────────────

export default function LandingPage() {
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef });
  const heroOpacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);
  const heroY = useTransform(scrollYProgress, [0, 0.6], [0, -40]);

  const [annualBilling, setAnnualBilling] = useState(false);

  return (
    <main className="tp-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&family=Space+Grotesk:wght@400;500;600&display=swap');

        .tp-root {
          background: #070711;
          color: #e2e8f0;
          min-height: 100vh;
          font-family: 'Space Grotesk', sans-serif;
          overflow-x: hidden;
        }

        /* ── Noise overlay ── */
        .tp-root::before {
          content: '';
          position: fixed;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
          pointer-events: none;
          z-index: 0;
          opacity: 0.6;
        }

        /* ── Nav ── */
        .tp-nav {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 100;
          padding: 16px 40px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(7,7,17,0.8);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }

        .tp-logo {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: 'Syne', sans-serif;
          font-weight: 800;
          font-size: 18px;
          color: #fff;
          text-decoration: none;
        }

        .tp-logo-icon {
          width: 28px;
          height: 28px;
          background: linear-gradient(135deg, #6366f1, #06b6d4);
          border-radius: 7px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .tp-nav-links {
          display: flex;
          align-items: center;
          gap: 32px;
          list-style: none;
          margin: 0;
          padding: 0;
        }

        .tp-nav-links a {
          color: #94a3b8;
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          transition: color 0.2s;
        }

        .tp-nav-links a:hover { color: #e2e8f0; }

        .tp-nav-actions { display: flex; align-items: center; gap: 12px; }

        .tp-btn-ghost {
          background: transparent;
          border: 1px solid rgba(255,255,255,0.1);
          color: #e2e8f0;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          text-decoration: none;
          transition: all 0.2s;
          font-family: 'Space Grotesk', sans-serif;
        }
        .tp-btn-ghost:hover { background: rgba(255,255,255,0.05); }

        .tp-btn-primary {
          background: linear-gradient(135deg, #6366f1, #818cf8);
          color: white;
          padding: 9px 18px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          text-decoration: none;
          border: none;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s;
          font-family: 'Space Grotesk', sans-serif;
        }
        .tp-btn-primary:hover { 
          transform: translateY(-1px); 
          box-shadow: 0 4px 20px rgba(99,102,241,0.4);
        }

        /* ── Hero ── */
        .tp-hero {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 120px 40px 80px;
          position: relative;
          overflow: hidden;
        }

        .tp-hero-glow {
          position: absolute;
          top: 20%;
          left: 50%;
          transform: translateX(-50%);
          width: 600px;
          height: 600px;
          background: radial-gradient(ellipse at center, rgba(99,102,241,0.15) 0%, transparent 70%);
          pointer-events: none;
        }

        .tp-hero-glow-2 {
          position: absolute;
          bottom: 10%;
          right: 10%;
          width: 400px;
          height: 400px;
          background: radial-gradient(ellipse at center, rgba(6,182,212,0.08) 0%, transparent 70%);
          pointer-events: none;
        }

        .tp-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(99,102,241,0.1);
          border: 1px solid rgba(99,102,241,0.3);
          color: #818cf8;
          padding: 5px 12px;
          border-radius: 100px;
          font-size: 12px;
          font-weight: 600;
          margin-bottom: 28px;
          letter-spacing: 0.02em;
          font-family: 'Space Grotesk', sans-serif;
        }

        .tp-hero-title {
          font-family: 'Syne', sans-serif;
          font-size: clamp(48px, 7vw, 88px);
          font-weight: 800;
          line-height: 1.02;
          letter-spacing: -0.03em;
          color: #fff;
          margin: 0 0 24px;
          max-width: 900px;
        }

        .tp-hero-title .accent {
          background: linear-gradient(135deg, #6366f1 0%, #06b6d4 50%, #10b981 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .tp-hero-sub {
          font-size: 20px;
          color: #94a3b8;
          max-width: 560px;
          line-height: 1.6;
          margin: 0 0 40px;
          font-weight: 400;
        }

        .tp-hero-ctas {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 20px;
        }

        .tp-cta-large {
          background: linear-gradient(135deg, #6366f1, #818cf8);
          color: white;
          padding: 14px 28px;
          border-radius: 10px;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          text-decoration: none;
          border: none;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.25s;
          font-family: 'Syne', sans-serif;
          letter-spacing: -0.01em;
        }
        .tp-cta-large:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 32px rgba(99,102,241,0.4);
        }

        .tp-social-proof {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #64748b;
          font-size: 13px;
        }

        .tp-stars { color: #f59e0b; letter-spacing: -2px; }

        /* ── Section ── */
        .tp-section {
          padding: 100px 40px;
          max-width: 1200px;
          margin: 0 auto;
          position: relative;
        }

        .tp-section-label {
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.15em;
          color: #6366f1;
          margin-bottom: 12px;
          font-family: 'Space Grotesk', sans-serif;
        }

        .tp-section-title {
          font-family: 'Syne', sans-serif;
          font-size: clamp(32px, 4vw, 52px);
          font-weight: 800;
          color: #fff;
          line-height: 1.1;
          letter-spacing: -0.02em;
          margin: 0 0 16px;
        }

        .tp-section-sub {
          font-size: 18px;
          color: #64748b;
          max-width: 500px;
          line-height: 1.6;
        }

        /* ── Stats ── */
        .tp-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 16px;
          overflow: hidden;
          margin: 80px auto;
          max-width: 800px;
        }

        .tp-stat {
          background: rgba(7,7,17,0.9);
          padding: 32px 24px;
          text-align: center;
        }

        .tp-stat-value {
          font-family: 'Syne', sans-serif;
          font-size: 36px;
          font-weight: 800;
          color: #fff;
          line-height: 1;
          margin-bottom: 6px;
        }

        .tp-stat-label {
          font-size: 13px;
          color: #64748b;
          font-weight: 500;
        }

        /* ── Features ── */
        .tp-features {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
          margin-top: 60px;
        }

        .tp-feature-card {
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 16px;
          padding: 32px;
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }

        .tp-feature-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--accent), transparent);
          opacity: 0;
          transition: opacity 0.3s;
        }

        .tp-feature-card:hover::before { opacity: 1; }
        .tp-feature-card:hover { 
          background: rgba(255,255,255,0.04);
          transform: translateY(-2px);
          border-color: rgba(255,255,255,0.1);
        }

        .tp-feature-icon {
          width: 44px;
          height: 44px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 20px;
        }

        .tp-feature-tag {
          display: inline-block;
          background: rgba(99,102,241,0.1);
          color: #818cf8;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          margin-bottom: 12px;
          letter-spacing: 0.03em;
        }

        .tp-feature-title {
          font-family: 'Syne', sans-serif;
          font-size: 22px;
          font-weight: 700;
          color: #fff;
          margin: 0 0 12px;
        }

        .tp-feature-desc {
          font-size: 14px;
          color: #64748b;
          line-height: 1.7;
        }

        /* ── Integrations ── */
        .tp-integrations-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 40px;
        }

        .tp-integration-pill {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          color: #94a3b8;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          transition: all 0.2s;
        }

        .tp-integration-pill:hover {
          background: rgba(99,102,241,0.08);
          border-color: rgba(99,102,241,0.3);
          color: #818cf8;
        }

        /* ── Capabilities ── */
        .tp-capabilities {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-top: 48px;
        }

        .tp-cap-item {
          display: flex;
          align-items: center;
          gap: 10px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 10px;
          padding: 14px 16px;
          transition: all 0.2s;
          font-size: 13px;
          font-weight: 500;
          color: #94a3b8;
        }

        .tp-cap-item:hover {
          background: rgba(99,102,241,0.06);
          border-color: rgba(99,102,241,0.2);
          color: #e2e8f0;
        }

        /* ── Pricing ── */
        .tp-pricing-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
          margin-top: 60px;
        }

        .tp-price-card {
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 16px;
          padding: 32px;
          position: relative;
          transition: all 0.3s;
        }

        .tp-price-card.featured {
          background: rgba(99,102,241,0.06);
          border-color: rgba(99,102,241,0.3);
          transform: scale(1.02);
        }

        .tp-price-badge {
          position: absolute;
          top: -12px;
          left: 50%;
          transform: translateX(-50%);
          background: linear-gradient(135deg, #6366f1, #818cf8);
          color: white;
          padding: 4px 14px;
          border-radius: 100px;
          font-size: 11px;
          font-weight: 700;
          white-space: nowrap;
          letter-spacing: 0.03em;
        }

        .tp-price-name {
          font-family: 'Syne', sans-serif;
          font-size: 20px;
          font-weight: 700;
          color: #fff;
          margin-bottom: 4px;
        }

        .tp-price-amount {
          font-family: 'Syne', sans-serif;
          font-size: 48px;
          font-weight: 800;
          color: #fff;
          line-height: 1;
          margin: 16px 0 4px;
        }

        .tp-price-period { font-size: 14px; color: #64748b; margin-bottom: 20px; }
        .tp-price-desc { font-size: 14px; color: #64748b; margin-bottom: 24px; line-height: 1.5; }

        .tp-price-features {
          list-style: none;
          margin: 0 0 28px;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .tp-price-features li {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-size: 13px;
          color: #94a3b8;
          line-height: 1.5;
        }

        .tp-price-features li .check { color: #10b981; flex-shrink: 0; margin-top: 1px; }

        /* ── Testimonials ── */
        .tp-testimonials {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
          margin-top: 60px;
        }

        .tp-testimonial {
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 14px;
          padding: 28px;
        }

        .tp-testimonial-quote {
          font-size: 15px;
          color: #cbd5e1;
          line-height: 1.7;
          margin-bottom: 20px;
          font-style: italic;
        }

        .tp-testimonial-author {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .tp-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: linear-gradient(135deg, #6366f1, #06b6d4);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 700;
          color: white;
        }

        .tp-author-name { font-size: 13px; font-weight: 600; color: #fff; }
        .tp-author-role { font-size: 12px; color: #64748b; }

        /* ── Security ── */
        .tp-security-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
          margin-top: 48px;
        }

        .tp-security-item {
          display: flex;
          gap: 16px;
          align-items: flex-start;
        }

        .tp-security-icon {
          width: 40px;
          height: 40px;
          background: rgba(16,185,129,0.1);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: #10b981;
        }

        /* ── FAQ ── */
        .tp-faq { max-width: 720px; margin: 60px auto 0; }

        .tp-faq-item {
          border-bottom: 1px solid rgba(255,255,255,0.06);
          padding: 20px 0;
        }

        .tp-faq-q {
          font-size: 15px;
          font-weight: 600;
          color: #e2e8f0;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .tp-faq-a {
          font-size: 14px;
          color: #64748b;
          line-height: 1.7;
          margin-top: 12px;
        }

        /* ── Footer ── */
        .tp-footer {
          border-top: 1px solid rgba(255,255,255,0.06);
          padding: 60px 40px 40px;
          max-width: 1200px;
          margin: 0 auto;
        }

        .tp-footer-grid {
          display: grid;
          grid-template-columns: 2fr 1fr 1fr 1fr;
          gap: 40px;
          margin-bottom: 48px;
        }

        .tp-footer-links { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
        .tp-footer-links a { color: #64748b; text-decoration: none; font-size: 13px; transition: color 0.2s; }
        .tp-footer-links a:hover { color: #e2e8f0; }
        .tp-footer-heading { font-size: 13px; font-weight: 700; color: #fff; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.05em; }

        .tp-billing-toggle {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 48px;
          justify-content: center;
        }

        .tp-toggle-btn {
          background: rgba(99,102,241,0.15);
          border: 1px solid rgba(99,102,241,0.3);
          color: #818cf8;
          padding: 6px 14px;
          border-radius: 100px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .tp-toggle-btn.active {
          background: #6366f1;
          color: white;
          border-color: #6366f1;
        }
        
        .savings-badge {
          background: rgba(16,185,129,0.15);
          border: 1px solid rgba(16,185,129,0.3);
          color: #10b981;
          padding: 3px 8px;
          border-radius: 100px;
          font-size: 11px;
          font-weight: 700;
          margin-left: 8px;
        }
      `}</style>

      {/* ── NAV ── */}
      <nav className="tp-nav">
        <a className="tp-logo" href="/">
          <div className="tp-logo-icon">
            <Zap size={14} color="white" />
          </div>
          TaskPilot
        </a>
        <ul className="tp-nav-links">
          <li><a href="#features">Features</a></li>
          <li><a href="#demo">Demo</a></li>
          <li><a href="#integrations">Integrations</a></li>
          <li><a href="#pricing">Pricing</a></li>
          <li><a href="#faq">FAQ</a></li>
        </ul>
        <div className="tp-nav-actions">
          <a className="tp-btn-ghost" href="/auth/login">Sign in</a>
          <a className="tp-btn-primary" href="/auth/signup">
            <Chrome size={14} />
            Add to Chrome
          </a>
        </div>
      </nav>

      {/* ── HERO ── */}
      <motion.section
        ref={heroRef}
        className="tp-hero"
        style={{ opacity: heroOpacity, y: heroY }}
      >
        <div className="tp-hero-glow" />
        <div className="tp-hero-glow-2" />

        <motion.div variants={stagger} initial="hidden" animate="visible">
          <motion.div variants={fadeUp}>
            <div className="tp-badge">
              <Zap size={10} />
              AI Browser OS — Now in Beta
            </div>
          </motion.div>

          <motion.h1 className="tp-hero-title" variants={fadeUp} custom={1}>
            Talk to any webpage{" "}
            <span className="accent">instantly.</span>
          </motion.h1>

          <motion.p className="tp-hero-sub" variants={fadeUp} custom={2}>
            Autofill forms, extract structured data, convert webpages into
            documents, and automate browser workflows — all with AI.
          </motion.p>

          <motion.div className="tp-hero-ctas" variants={fadeUp} custom={3}>
            <a className="tp-cta-large" href="/auth/signup">
              <Chrome size={16} />
              Add to Chrome — Free
            </a>
            <a className="tp-btn-ghost" href="#demo" style={{ padding: "14px 24px", fontSize: "15px" }}>
              Watch demo →
            </a>
          </motion.div>

          <motion.div className="tp-social-proof" variants={fadeUp} custom={4}>
            <span className="tp-stars">★★★★★</span>
            <span>4.9/5 from 2,400+ reviews · 12,000+ users</span>
          </motion.div>
        </motion.div>
      </motion.section>

      {/* ── STATS ── */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 40px" }}>
        <motion.div
          className="tp-stats"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={stagger}
        >
          {STATS.map((stat, i) => (
            <motion.div key={i} className="tp-stat" variants={fadeUp} custom={i}>
              <div className="tp-stat-value">{stat.value}</div>
              <div className="tp-stat-label">{stat.label}</div>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* ── DEMO ── */}
      <section className="tp-section" id="demo">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={stagger}
        >
          <motion.div className="tp-section-label" variants={fadeUp}>
            See it in action
          </motion.div>
          <motion.h2 className="tp-section-title" variants={fadeUp} custom={1}>
            Smart Paste: 0.8 seconds<br />to fill any form.
          </motion.h2>
          <motion.p className="tp-section-sub" style={{ marginBottom: 40 }} variants={fadeUp} custom={2}>
            Copy any contact info. Press Alt+V. Watch TaskPilot fill every field
            with 95%+ accuracy — no configuration required.
          </motion.p>
          <motion.div variants={fadeUp} custom={3}>
            <SmartPasteDemo />
          </motion.div>
        </motion.div>
      </section>

      {/* ── FEATURES ── */}
      <section className="tp-section" id="features">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={stagger}
        >
          <motion.div className="tp-section-label" variants={fadeUp}>Product Roadmap</motion.div>
          <motion.h2 className="tp-section-title" variants={fadeUp} custom={1}>
            Ask → Execute → Done.
          </motion.h2>
          <motion.p className="tp-section-sub" variants={fadeUp} custom={2}>
            Three phases. Each one more powerful than the last.
          </motion.p>

          <div className="tp-features">
            {FEATURES.map((f, i) => (
              <motion.div
                key={i}
                className="tp-feature-card"
                style={{ "--accent": f.accent } as React.CSSProperties}
                variants={fadeUp}
                custom={i + 3}
              >
                <div
                  className="tp-feature-icon"
                  style={{ background: `${f.accent}18` }}
                >
                  <f.icon size={20} color={f.accent} />
                </div>
                <div className="tp-feature-tag">{f.tag}</div>
                <h3 className="tp-feature-title">{f.title}</h3>
                <p className="tp-feature-desc">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ── CAPABILITIES ── */}
      <section className="tp-section">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={stagger}
        >
          <motion.div className="tp-section-label" variants={fadeUp}>Sidebar Commands</motion.div>
          <motion.h2 className="tp-section-title" variants={fadeUp} custom={1}>
            Everything you need,<br />on every page.
          </motion.h2>
          <div className="tp-capabilities">
            {CAPABILITIES.map((cap, i) => (
              <motion.div key={i} className="tp-cap-item" variants={fadeUp} custom={i}>
                <cap.icon size={16} color="#6366f1" />
                {cap.label}
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ── INTEGRATIONS ── */}
      <section className="tp-section" id="integrations">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={stagger}
        >
          <motion.div className="tp-section-label" variants={fadeUp}>Integrations</motion.div>
          <motion.h2 className="tp-section-title" variants={fadeUp} custom={1}>
            Works everywhere<br />you work.
          </motion.h2>
          <motion.p className="tp-section-sub" variants={fadeUp} custom={2}>
            Native intelligence for your CRM, email, social, and productivity tools.
          </motion.p>
          <motion.div className="tp-integrations-grid" variants={stagger}>
            {INTEGRATIONS.map((name, i) => (
              <motion.div key={i} className="tp-integration-pill" variants={fadeUp} custom={i}>
                {name}
              </motion.div>
            ))}
            <motion.div className="tp-integration-pill" variants={fadeUp} custom={INTEGRATIONS.length} style={{ opacity: 0.5 }}>
              +40 more →
            </motion.div>
          </motion.div>
        </motion.div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="tp-section">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={stagger}
        >
          <motion.div className="tp-section-label" variants={fadeUp}>Social Proof</motion.div>
          <motion.h2 className="tp-section-title" variants={fadeUp} custom={1}>
            Loved by 12,000+<br />productivity obsessives.
          </motion.h2>
          <div className="tp-testimonials">
            {TESTIMONIALS.map((t, i) => (
              <motion.div key={i} className="tp-testimonial" variants={fadeUp} custom={i + 2}>
                <div className="tp-testimonial-quote">"{t.quote}"</div>
                <div className="tp-testimonial-author">
                  <div className="tp-avatar">{t.avatar}</div>
                  <div>
                    <div className="tp-author-name">{t.author}</div>
                    <div className="tp-author-role">{t.role}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ── PRICING ── */}
      <section className="tp-section" id="pricing">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={stagger}
        >
          <motion.div className="tp-section-label" variants={fadeUp}>Pricing</motion.div>
          <motion.h2 className="tp-section-title" variants={fadeUp} custom={1}>
            Simple pricing.<br />No surprises.
          </motion.h2>

          <motion.div className="tp-billing-toggle" variants={fadeUp} custom={2}>
            <button
              className={`tp-toggle-btn ${!annualBilling ? "active" : ""}`}
              onClick={() => setAnnualBilling(false)}
            >
              Monthly
            </button>
            <button
              className={`tp-toggle-btn ${annualBilling ? "active" : ""}`}
              onClick={() => setAnnualBilling(true)}
            >
              Annual
              <span className="savings-badge">Save 17%</span>
            </button>
          </motion.div>

          <div className="tp-pricing-grid">
            {PRICING.map((plan, i) => (
              <motion.div
                key={i}
                className={`tp-price-card ${plan.accent ? "featured" : ""}`}
                variants={fadeUp}
                custom={i + 3}
              >
                {plan.badge && <div className="tp-price-badge">{plan.badge}</div>}
                <div className="tp-price-name">{plan.name}</div>
                <div className="tp-price-desc">{plan.description}</div>
                <div className="tp-price-amount">
                  {plan.price === null
                    ? "Custom"
                    : plan.price === 0
                    ? "Free"
                    : `$${annualBilling && plan.name === "Pro" ? Math.floor((plan.price as number) * 10) : plan.price}`}
                </div>
                <div className="tp-price-period">
                  {plan.price === 0
                    ? "forever"
                    : plan.price === null
                    ? "per team"
                    : annualBilling
                    ? "/month, billed annually"
                    : plan.period}
                </div>
                <ul className="tp-price-features">
                  {plan.features.map((feature, j) => (
                    <li key={j}>
                      <Check size={14} className="check" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <a
                  href={plan.href}
                  className={plan.accent ? "tp-cta-large" : "tp-btn-ghost"}
                  style={{ display: "flex", justifyContent: "center", textDecoration: "none" }}
                >
                  {plan.cta}
                  {plan.accent && <ArrowRight size={14} style={{ marginLeft: 4 }} />}
                </a>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ── SECURITY ── */}
      <section className="tp-section">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={stagger}
        >
          <motion.div className="tp-section-label" variants={fadeUp}>Security & Privacy</motion.div>
          <motion.h2 className="tp-section-title" variants={fadeUp} custom={1}>
            Privacy-first.<br />By design.
          </motion.h2>
          <div className="tp-security-grid">
            {[
              { icon: Lock, title: "Zero forced signup", desc: "Use TaskPilot anonymously. No account required to try the core features." },
              { icon: Shield, title: "No data retention", desc: "Page content is processed in real-time and never stored on our servers." },
              { icon: Globe, title: "Local-first processing", desc: "Regex and heuristic parsing runs entirely in your browser. AI only when needed." },
              { icon: Clock, title: "Session encryption", desc: "All sessions are encrypted with secure, ephemeral tokens." },
              { icon: TrendingUp, title: "Minimal permissions", desc: "TaskPilot only requests the permissions it actually needs. No tab history, no browsing data." },
              { icon: Users, title: "GDPR compliant", desc: "Full data deletion on request. EU data residency available for enterprise." },
            ].map((item, i) => (
              <motion.div key={i} className="tp-security-item" variants={fadeUp} custom={i}>
                <div className="tp-security-icon">
                  <item.icon size={18} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: "#e2e8f0", marginBottom: 4, fontSize: 14 }}>{item.title}</div>
                  <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>{item.desc}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ── FAQ ── */}
      <section className="tp-section" id="faq">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={stagger}
        >
          <motion.div className="tp-section-label" variants={fadeUp}>FAQ</motion.div>
          <motion.h2 className="tp-section-title" variants={fadeUp} custom={1}>
            Questions & answers.
          </motion.h2>
          <div className="tp-faq">
            {[
              { q: "Do I need to create an account?", a: "No. TaskPilot works anonymously for the first 10 actions. Create an account to track your productivity and unlock more." },
              { q: "How does Smart Paste work?", a: "TaskPilot runs three layers: first regex (extracts emails, phones), then heuristics (maps labels to fields), then AI only when confidence is low. Most pastes never hit the AI layer, keeping it fast and free." },
              { q: "What sites does it work on?", a: "Any website — HubSpot, Salesforce, Gmail, LinkedIn, Shopify, custom internal dashboards. If it has a form or data, TaskPilot works." },
              { q: "Is my data sent to OpenAI?", a: "Only the visible text on the page (not your entire browser history) and only when AI processing is actually needed. We never send credentials, passwords, or payment info." },
              { q: "How much does Pro cost?", a: "$19/month or $190/year (saves 17%). 7-day free trial included." },
              { q: "Can I use it for my whole team?", a: "Enterprise plan includes team management, SSO, and centralized billing. Contact enterprise@taskpilot.cc." },
            ].map((item, i) => (
              <FAQItem key={i} q={item.q} a={item.a} />
            ))}
          </div>
        </motion.div>
      </section>

      {/* ── CTA ── */}
      <section style={{ padding: "80px 40px", textAlign: "center", position: "relative" }}>
        <div style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at center, rgba(99,102,241,0.12) 0%, transparent 70%)",
          pointerEvents: "none"
        }} />
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={stagger}
        >
          <motion.h2
            variants={fadeUp}
            style={{ fontFamily: "Syne, sans-serif", fontSize: "clamp(36px,5vw,60px)", fontWeight: 800, color: "#fff", lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: 20 }}
          >
            Start automating<br />your browser today.
          </motion.h2>
          <motion.p
            variants={fadeUp}
            custom={1}
            style={{ color: "#64748b", fontSize: 18, marginBottom: 36 }}
          >
            Free to start. No credit card required.
          </motion.p>
          <motion.div variants={fadeUp} custom={2} style={{ display: "flex", justifyContent: "center", gap: 12 }}>
            <a className="tp-cta-large" href="/auth/signup">
              <Chrome size={16} />
              Add to Chrome — It's Free
            </a>
          </motion.div>
        </motion.div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="tp-footer">
          <div className="tp-footer-grid">
            <div>
              <a className="tp-logo" href="/" style={{ marginBottom: 16, display: "flex" }}>
                <div className="tp-logo-icon"><Zap size={14} color="white" /></div>
                TaskPilot
              </a>
              <p style={{ color: "#64748b", fontSize: 13, lineHeight: 1.7, maxWidth: 260 }}>
                The AI operating layer for the browser. Talk to any webpage instantly.
              </p>
            </div>
            <div>
              <div className="tp-footer-heading">Product</div>
              <ul className="tp-footer-links">
                <li><a href="#features">Features</a></li>
                <li><a href="#pricing">Pricing</a></li>
                <li><a href="/changelog">Changelog</a></li>
                <li><a href="/roadmap">Roadmap</a></li>
              </ul>
            </div>
            <div>
              <div className="tp-footer-heading">Company</div>
              <ul className="tp-footer-links">
                <li><a href="/about">About</a></li>
                <li><a href="/blog">Blog</a></li>
                <li><a href="/careers">Careers</a></li>
                <li><a href="mailto:hello@taskpilot.cc">Contact</a></li>
              </ul>
            </div>
            <div>
              <div className="tp-footer-heading">Legal</div>
              <ul className="tp-footer-links">
                <li><a href="/privacy">Privacy Policy</a></li>
                <li><a href="/terms">Terms of Service</a></li>
                <li><a href="/security">Security</a></li>
              </ul>
            </div>
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "#475569", fontSize: 12 }}>© 2025 TaskPilot. All rights reserved.</span>
            <span style={{ color: "#475569", fontSize: 12 }}>Made with ⚡ for power users everywhere.</span>
          </div>
        </div>
      </footer>
    </main>
  );
}

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="tp-faq-item">
      <div className="tp-faq-q" onClick={() => setOpen(!open)}>
        <span>{q}</span>
        <span style={{ color: "#6366f1", fontSize: 18, lineHeight: 1 }}>{open ? "−" : "+"}</span>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            className="tp-faq-a"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            {a}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
