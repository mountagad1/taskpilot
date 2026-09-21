import { SITE_URL } from '@/lib/site'

// Rendered once, in the root layout. Deliberately does NOT include
// aggregateRating/review data — TaskPilot has no verified rating source to
// back one, and fabricating one in structured data (as opposed to page
// copy) is the kind of claim Google takes manual action against. Add it
// only when there's a real, checkable number behind it.
export function OrganizationJsonLd() {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'TaskPilot',
    url: SITE_URL,
    logo: `${SITE_URL}/icon-512.png`,
  }
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}

export function SoftwareApplicationJsonLd() {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'TaskPilot',
    url: SITE_URL,
    description:
      'Turn natural language into real browser actions. Fill forms, extract data, generate replies, automate repetitive work, and export results — all from any website.',
    applicationCategory: 'ProductivityApplication',
    operatingSystem: 'Chrome, Edge, Brave, Arc',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: 'Free plan — 30 AI actions and 5 exports per month.',
    },
  }
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}
