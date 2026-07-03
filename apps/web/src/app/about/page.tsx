import type { Metadata } from 'next'
import { PageShell, Section } from '../_shell'

export const metadata: Metadata = {
  title: 'About',
  description:
    'TaskPilot is the AI operating layer for the browser. Learn what we’re building and why.',
}

const PRINCIPLES = [
  {
    title: 'Ask → Execute → Done',
    body: 'Most AI tools stop at answering. TaskPilot plans with the model and executes with the browser engine, so a request turns into a finished task — not just a suggestion.',
  },
  {
    title: 'Privacy-first, not privacy-later',
    body: 'You can use the core features without an account. Page content is processed in real time and not stored. Local parsing keeps much of your data on your device.',
  },
  {
    title: 'Cost-honest AI',
    body: 'We route the cheapest capable path first — regex and heuristics before any model call, and caching for repeat work — so the product stays fast and sustainable.',
  },
  {
    title: 'Meet people where they work',
    body: 'The browser is where real work happens. TaskPilot lives on every page instead of asking you to copy your work into yet another app.',
  },
]

export default function AboutPage() {
  return (
    <PageShell
      eyebrow="Company"
      title="We’re turning the browser into an intelligent workspace"
      subtitle="TaskPilot is the AI operating layer for the browser — talk to any page, extract what you need, and hand off the busywork."
    >
      <Section heading="Why we’re building this">
        Knowledge work has quietly become browser work. We copy data between tabs, retype the
        same details into forms, skim long pages for a handful of facts, and stitch tools
        together by hand. AI can do most of that — but only if it can actually act on the page
        in front of you, not just chat about it in a separate window. TaskPilot exists to close
        that gap.
      </Section>

      <Section heading="What we believe">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 16,
            marginTop: 12,
          }}
        >
          {PRINCIPLES.map((p) => (
            <div
              key={p.title}
              className="glass"
              style={{ borderRadius: 14, padding: 20, border: '1px solid var(--border)' }}
            >
              <h3
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: 15,
                  fontWeight: 700,
                  color: 'var(--foreground)',
                  marginBottom: 8,
                }}
              >
                {p.title}
              </h3>
              <p style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--foreground-secondary)', margin: 0 }}>
                {p.body}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section heading="Who it’s for">
        Recruiters sourcing candidates, sales teams keeping a CRM current, operators pulling
        product data, agencies compiling client reports, founders running competitive research,
        and anyone whose day is spent moving information around a browser.
      </Section>

      <Section heading="Get in touch">
        We&apos;d love to hear how you work and where TaskPilot could help. Reach us at{' '}
        <a href="mailto:hello@taskpilot.cc" style={{ color: 'var(--indigo-light)' }}>
          hello@taskpilot.cc
        </a>
        .
      </Section>
    </PageShell>
  )
}
