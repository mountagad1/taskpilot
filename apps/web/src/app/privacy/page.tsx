import type { Metadata } from 'next'
import { PageShell, Section } from '../_shell'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    "How TaskPilot collects, uses, and protects your data. Privacy-first by design.",
}

const EFFECTIVE = 'January 1, 2026'

export default function PrivacyPage() {
  return (
    <PageShell
      eyebrow="Legal"
      title="Privacy Policy"
      subtitle="TaskPilot is built privacy-first. This page explains what we collect, why, and the control you have over it."
    >
      <p style={{ color: 'var(--foreground-tertiary)', fontSize: 14, marginBottom: 40 }}>
        Effective {EFFECTIVE}
      </p>

      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '16px 20px',
          marginBottom: 40,
          fontSize: 14,
          color: 'var(--foreground-secondary)',
        }}
      >
        <strong style={{ color: 'var(--foreground)' }}>The short version:</strong> You
        can use TaskPilot&apos;s core features without an account. We don&apos;t sell your
        data. Page content you act on is processed in real time to fulfill your
        request and is not stored on our servers. You can delete your data at any time.
      </div>

      <Section heading="1. Who we are">
        This policy applies to the TaskPilot browser extension, website, and dashboard
        (together, the &quot;Service&quot;), operated by TaskPilot. If you have questions,
        contact us at{' '}
        <a href="mailto:privacy@taskpilot.cc" style={{ color: 'var(--indigo-light)' }}>
          privacy@taskpilot.cc
        </a>
        .
      </Section>

      <Section heading="2. Information we collect">
        We keep collection to the minimum needed to run the Service:
        <ul style={{ marginTop: 12, paddingLeft: 20, display: 'grid', gap: 8 }}>
          <li>
            <strong style={{ color: 'var(--foreground)' }}>Account data</strong> (optional).
            If you create an account, we store your email address and authentication
            details through our provider, Supabase.
          </li>
          <li>
            <strong style={{ color: 'var(--foreground)' }}>Anonymous session data.</strong>{' '}
            If you use the Service without signing in, we generate an anonymous session
            identifier to enforce free-tier usage limits. It is not linked to your identity.
          </li>
          <li>
            <strong style={{ color: 'var(--foreground)' }}>Content you submit.</strong>{' '}
            Text or page content you ask TaskPilot to process (for example, to autofill a
            form or summarize a page). This is processed to fulfill your request; see
            &quot;How content is handled&quot; below.
          </li>
          <li>
            <strong style={{ color: 'var(--foreground)' }}>Usage and billing data.</strong>{' '}
            Counts of actions taken, feature usage, and — for paid plans — billing details
            handled by our payment processor, Stripe. We never receive or store your full
            card number.
          </li>
          <li>
            <strong style={{ color: 'var(--foreground)' }}>Product analytics.</strong>{' '}
            Aggregate, privacy-respecting analytics (via PostHog) to understand which
            features are used. You can opt out in settings.
          </li>
        </ul>
      </Section>

      <Section heading="3. How content is handled">
        When you invoke an AI action, the relevant content is sent through our secure
        server-side proxy to our AI provider to generate a result, then returned to you.
        We do not retain that page content after your request completes, and we do not use
        it to train models. Local parsing (regex and heuristics) runs entirely in your
        browser and never leaves your device.
      </Section>

      <Section heading="4. How we use information">
        We use the information above to: provide and maintain the Service; enforce plan
        limits and prevent abuse; process payments; respond to support requests; and
        improve features through aggregate analytics. We do not sell your personal
        information, and we do not share it with third parties for their own marketing.
      </Section>

      <Section heading="5. Service providers">
        We rely on a small set of processors, each bound by contractual data-protection
        obligations: Supabase (authentication and database), Stripe (payments), our AI
        provider (request processing), PostHog (analytics), and Vercel (hosting). These
        providers process data only to perform services on our behalf.
      </Section>

      <Section heading="6. Data retention">
        Account and usage records are kept for as long as your account is active. Submitted
        page content is not retained after a request completes. When you delete your account,
        we remove your personal data within 30 days, except where we must retain limited
        records to meet legal or accounting obligations.
      </Section>

      <Section heading="7. Your rights">
        Depending on where you live, you may have rights to access, correct, export, or
        delete your personal data, and to object to or restrict certain processing. To
        exercise any of these, email{' '}
        <a href="mailto:privacy@taskpilot.cc" style={{ color: 'var(--indigo-light)' }}>
          privacy@taskpilot.cc
        </a>
        . We respond within the timeframes required by applicable law. EU/EEA users may also
        lodge a complaint with their local data-protection authority.
      </Section>

      <Section heading="8. Security">
        AI requests are routed through a server-side proxy so provider API keys are never
        exposed to your browser. We enforce row-level security on our database, encrypt data
        in transit, rate-limit requests, and request only the browser permissions the
        extension actually needs. See our{' '}
        <a href="/security" style={{ color: 'var(--indigo-light)' }}>
          Security page
        </a>{' '}
        for details.
      </Section>

      <Section heading="9. Children">
        The Service is not directed to children under 13 (or the minimum age in your
        jurisdiction), and we do not knowingly collect their data.
      </Section>

      <Section heading="10. Changes to this policy">
        We may update this policy as the Service evolves. Material changes will be announced
        on this page with an updated effective date, and where appropriate, by email.
      </Section>

      <div
        style={{
          marginTop: 48,
          padding: '16px 20px',
          borderRadius: 12,
          background: 'rgba(245,158,11,0.10)',
          border: '1px solid rgba(245,158,11,0.25)',
          color: '#fbbf24',
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        This template reflects TaskPilot&apos;s described data practices but is not legal
        advice. Have counsel review and tailor it to your jurisdiction (GDPR, CCPA, etc.)
        before publishing.
      </div>
    </PageShell>
  )
}
