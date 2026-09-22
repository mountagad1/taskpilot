// ============================================================
// TASKPILOT — FAQ
// apps/web/src/components/marketing/faq.tsx
//
// Deliberately a SERVER component built on <details>/<summary>: keyboard
// support, screen-reader semantics and open/close all come from the
// platform, so the section ships zero JavaScript and still works if JS
// never loads.
//
// FAQS is exported because the FAQPage structured data is generated from
// this same array. Google requires the marked-up answer to match the
// visible answer exactly — deriving both from one source is what keeps
// them from drifting apart the next time someone edits the copy.
//
// Every answer here is checkable against something the product actually
// states (pricing cards, /security, /privacy). Nothing about SOC 2,
// model training or data retention appears, because there is no verified
// source for those claims.
// ============================================================

import { IconChevronRight } from '@/components/ui/icons'

export interface FaqItem {
  q: string
  a: string
}

export const FAQS: FaqItem[] = [
  {
    q: 'What is TaskPilot, exactly?',
    a: 'A browser extension that adds an AI layer to any website you are already on. It works in three phases: Smart Paste fills forms from your clipboard, the AI Sidebar reads and acts on the page you are viewing, and Browser Actions carries out multi-step tasks you describe in plain language.',
  },
  {
    q: 'Which browsers does it work in?',
    a: 'Chrome, Edge, Brave and Arc — any Chromium-based browser that supports Chrome extensions. There is no desktop app to install and nothing to configure on the sites you use it on.',
  },
  {
    q: 'Do I need a credit card to start?',
    a: 'No. The free plan needs no card and stays free: 30 AI actions and 5 exports every month, Smart Paste on all sites, and the basic AI Sidebar.',
  },
  {
    q: 'What happens when I use up the free allowance?',
    a: 'Your allowance resets at the start of each month. If you need more before then, Pro removes the cap on AI actions and exports and adds CRM integrations and Browser Actions.',
  },
  {
    q: 'How much is Pro, and what does it add?',
    a: 'Pro is $39.99 per month billed monthly, or $31.99 per month billed annually ($383.90 a year), and starts with a 7-day trial. It adds unlimited AI actions and exports, advanced field mapping, the full AI Sidebar, HubSpot and Notion integrations, Browser Actions and priority support.',
  },
  {
    q: 'Which sites does Smart Paste work on?',
    a: 'Any web form. TaskPilot reads the fields on the page rather than relying on a per-site template, so it is not limited to a fixed list — and it is specifically tuned for HubSpot, Salesforce, Gmail and 50+ common apps.',
  },
  {
    q: 'What is the difference between the AI Sidebar and Browser Actions?',
    a: 'The AI Sidebar assists you on the page you are looking at — summarise, translate, extract, draft a reply. Browser Actions goes further and does the work for you: you describe an outcome, and TaskPilot plans the steps, carries them out across tabs, and reports what it did.',
  },
  {
    q: 'How is my data handled?',
    a: 'Traffic is encrypted with TLS in transit, model API keys are never placed in your browser, the extension requests least-privilege permissions, and your account data is isolated with row-level security. The Security page sets out the details in full.',
  },
  {
    q: 'Does it work for a whole team?',
    a: 'Yes. The Enterprise plan adds per-seat pricing with volume discounts, SSO and SAML, team management, REST API access, and an SLA with a security review.',
  },
]

export function Faq() {
  return (
    <div className="mx-auto mt-10 max-w-[760px]">
      {FAQS.map((item) => (
        <details key={item.q} className="faq-item group">
          <summary className="faq-q">
            <span>{item.q}</span>
            <IconChevronRight size={16} className="faq-chevron" />
          </summary>
          <div className="faq-a">
            <p>{item.a}</p>
          </div>
        </details>
      ))}

      <style>{`
        .faq-item {
          border-bottom: 1px solid var(--border-subtle);
        }
        .faq-item:first-child { border-top: 1px solid var(--border-subtle); }
        .faq-q {
          display: flex; align-items: center; justify-content: space-between; gap: 16px;
          padding: 20px 4px; cursor: pointer; list-style: none;
          font-size: 15.5px; font-weight: 500; color: var(--foreground);
          transition: color 180ms ease-out;
        }
        .faq-q::-webkit-details-marker { display: none; }
        .faq-q:hover { color: var(--indigo-light); }
        .faq-chevron {
          flex-shrink: 0; color: var(--foreground-muted);
          transform: rotate(90deg);
          transition: transform 220ms ease-out, color 180ms ease-out;
        }
        .faq-item[open] .faq-chevron { transform: rotate(-90deg); color: var(--indigo-light); }
        .faq-a {
          padding: 0 4px 22px;
          font-size: 14px; line-height: 1.7; color: var(--foreground-secondary);
          max-width: 68ch;
        }
        @media (prefers-reduced-motion: reduce) {
          .faq-chevron { transition: none; }
        }
      `}</style>
    </div>
  )
}
