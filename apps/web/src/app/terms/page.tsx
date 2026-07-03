import type { Metadata } from 'next'
import { PageShell, Section } from '../_shell'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms that govern your use of TaskPilot.',
}

const EFFECTIVE = 'January 1, 2026'

export default function TermsPage() {
  return (
    <PageShell
      eyebrow="Legal"
      title="Terms of Service"
      subtitle="These terms govern your access to and use of TaskPilot. By using the Service, you agree to them."
    >
      <p style={{ color: 'var(--foreground-tertiary)', fontSize: 14, marginBottom: 40 }}>
        Effective {EFFECTIVE}
      </p>

      <Section heading="1. Acceptance of terms">
        By installing the extension, creating an account, or otherwise using TaskPilot (the
        &quot;Service&quot;), you agree to be bound by these Terms of Service. If you are using
        the Service on behalf of an organization, you represent that you have authority to bind
        that organization.
      </Section>

      <Section heading="2. The Service">
        TaskPilot is an AI-assisted browser tool that helps you autofill forms, extract data,
        transform page content, and automate browser tasks. Features vary by plan and may
        change as we improve the product.
      </Section>

      <Section heading="3. Accounts and eligibility">
        Some features require an account. You are responsible for maintaining the security of
        your credentials and for all activity under your account. You must be at least 13 years
        old (or the minimum age in your jurisdiction) to use the Service.
      </Section>

      <Section heading="4. Plans, billing, and renewals">
        Paid plans are billed in advance on a recurring basis (monthly or annually) through our
        payment processor, Stripe. Subscriptions renew automatically until cancelled. You may
        cancel at any time; cancellation takes effect at the end of the current billing period,
        and fees already paid are non-refundable except where required by law. We may change
        pricing with advance notice; changes apply to your next renewal.
      </Section>

      <Section heading="5. Acceptable use">
        You agree not to:
        <ul style={{ marginTop: 12, paddingLeft: 20, display: 'grid', gap: 8 }}>
          <li>Use the Service to violate any law or third-party right, including privacy and intellectual-property rights.</li>
          <li>Scrape, collect, or process data in a manner that breaches a website&apos;s terms or applicable law.</li>
          <li>Attempt to reverse-engineer, disrupt, or circumvent the Service&apos;s security or rate limits.</li>
          <li>Resell or provide the Service to third parties except as expressly permitted.</li>
          <li>Use the Service to generate unlawful, harmful, or deceptive content.</li>
        </ul>
        You are solely responsible for how you use extracted data and for complying with the
        terms of the websites you interact with.
      </Section>

      <Section heading="6. AI output">
        The Service uses AI models that can produce inaccurate or incomplete results. Output is
        provided &quot;as is&quot; for your review; you are responsible for verifying it before
        relying on it. TaskPilot does not guarantee the accuracy of AI-generated content.
      </Section>

      <Section heading="7. Intellectual property">
        The Service, including its software, design, and branding, is owned by TaskPilot and
        protected by intellectual-property laws. We grant you a limited, non-exclusive,
        non-transferable license to use the Service in accordance with these terms. You retain
        ownership of content you submit.
      </Section>

      <Section heading="8. Third-party services">
        The Service integrates with third-party platforms (for example, CRMs and productivity
        tools). Your use of those platforms is governed by their own terms, and we are not
        responsible for their availability or conduct.
      </Section>

      <Section heading="9. Disclaimers">
        The Service is provided &quot;as is&quot; and &quot;as available,&quot; without warranties
        of any kind, whether express or implied, including merchantability, fitness for a
        particular purpose, and non-infringement, to the fullest extent permitted by law.
      </Section>

      <Section heading="10. Limitation of liability">
        To the maximum extent permitted by law, TaskPilot will not be liable for any indirect,
        incidental, special, consequential, or punitive damages, or for lost profits or data.
        Our total liability for any claim relating to the Service will not exceed the amount you
        paid us in the twelve months before the claim arose.
      </Section>

      <Section heading="11. Termination">
        You may stop using the Service at any time. We may suspend or terminate your access if
        you breach these terms or use the Service in a way that risks harm to others or to the
        Service. On termination, your right to use the Service ends immediately.
      </Section>

      <Section heading="12. Changes to these terms">
        We may update these terms as the Service evolves. Material changes will be posted here
        with an updated effective date. Continued use after changes take effect constitutes
        acceptance.
      </Section>

      <Section heading="13. Contact">
        Questions about these terms? Email{' '}
        <a href="mailto:legal@taskpilot.cc" style={{ color: 'var(--indigo-light)' }}>
          legal@taskpilot.cc
        </a>
        .
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
        This is a starting template, not legal advice. Add a governing-law/jurisdiction clause
        and have counsel review it before you rely on it.
      </div>
    </PageShell>
  )
}
