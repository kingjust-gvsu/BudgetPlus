import type { Category } from './api/types'
import { formatCents } from './money'

const LONG_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// "2027-03-15" → "March 15, 2027"
export function formatLongDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  return `${LONG_MONTHS[month - 1]} ${day}, ${year}`
}

// How often a bill is due, in words: "every 6 months", "yearly"
export function describeFrequency(months: number): string {
  if (months === 1) return 'a month'
  if (months === 12) return 'a year'
  return `every ${months} months`
}

// A category's budget in plain words, e.g. "$480.00 a month", "12.5% of income", or "Remainder".
// Returns null when nothing has been set yet.
export function describeBudget(category: Category): string | null {
  if (category.budgetType === 'REMAINDER') return 'Remainder'
  if (category.budgetType === 'PERCENT_OF_INCOME') return `${category.budgetPercent}% of income`
  if (category.budgetCents === null) return null

  const amount = `${formatCents(category.budgetCents)} ${describeFrequency(category.frequencyMonths)}`
  return category.kind === 'BILL' ? `Est. ${amount}` : amount
}
