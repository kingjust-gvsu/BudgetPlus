// Money is stored as whole cents (1234 = $12.34) so totals are exact.
// These helpers convert between cents and what people type and read.

const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

// 1234 → "$12.34", -1800 → "-$18.00"
export function formatCents(cents: number): string {
  return dollars.format(cents / 100)
}

// What someone typed → cents, or null if it isn't an amount.
// Accepts "12", "12.3", "12.34", "$1,234.56", and "-18" (a refund).
export function parseDollars(text: string): number | null {
  const cleaned = text.trim().replace(/[$,\s]/g, '')
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned)
  if (!match) return null
  const [, minus, whole, fraction = ''] = match
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return minus ? -cents : cents
}

// 1234 → "12.34", for putting an amount back into a form field
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2)
}
