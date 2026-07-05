export function formatPrice(cents: number, currency = 'usd'): string {
  if (cents === 0) return 'Free'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100)
}

export const CATEGORY_LABELS: Record<string, string> = {
  sales: 'Sales',
  extraction: 'Extraction',
  ecommerce: 'E-commerce',
  writing: 'Writing',
  research: 'Research',
  language: 'Language',
  productivity: 'Productivity',
  automation: 'Automation',
}
