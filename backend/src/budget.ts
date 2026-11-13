import type { Category } from './categories.ts'

// Works out how much each category gets in a month, from the user's income and budget settings.
// Everything is in whole cents, so totals are exact.

export type BudgetLine = {
  categoryId: string
  // What the category gets this month; null when it can't be worked out (a percent or the
  // remainder before income is entered) or hasn't been set
  monthlyCents: number | null
  // A fixed amount or bill estimate that hasn't been entered yet
  notSet: boolean
}

export type BudgetPlan = {
  lines: BudgetLine[]
  // Everything except the remainder, added up
  plannedCents: number
  // What the remainder category gets (never below zero); null with no income or no remainder category
  remainderCents: number | null
  // How far everything except the remainder goes past income; 0 when it fits
  overPlannedCents: number
}

// A share of income, e.g. 12.5% of $4,000.00 = $500.00, rounded to the nearest cent
export function percentOfIncome(incomeCents: number, percent: number): number {
  const hundredths = Math.round(percent * 100)
  return Math.round((incomeCents * hundredths) / 10000)
}

// A bill paid every few months, spread evenly over the months between payments. Rounded up,
// so the set-asides always add up to at least the full bill. (Catching up when the due date
// is close is handled by the fund calculations.)
export function evenSetAside(billCents: number, frequencyMonths: number): number {
  return Math.ceil(billCents / frequencyMonths)
}

// One category's monthly amount, for every budget type except the remainder
function monthlyAmount(category: Category, incomeCents: number | null): BudgetLine {
  const line = (monthlyCents: number | null, notSet = false) => ({ categoryId: category.id, monthlyCents, notSet })

  if (category.budgetType === 'PERCENT_OF_INCOME') {
    return line(incomeCents === null || category.budgetPercent === null ? null : percentOfIncome(incomeCents, category.budgetPercent))
  }
  if (category.budgetCents === null) return line(null, true)
  if (category.kind === 'BILL' && category.frequencyMonths > 1) {
    return line(evenSetAside(category.budgetCents, category.frequencyMonths))
  }
  return line(category.budgetCents)
}

export function planBudget(incomeCents: number | null, categories: Category[]): BudgetPlan {
  const remainder = categories.find((c) => c.budgetType === 'REMAINDER')
  const others = categories.filter((c) => c !== remainder).map((c) => monthlyAmount(c, incomeCents))
  const plannedCents = others.reduce((sum, line) => sum + (line.monthlyCents ?? 0), 0)

  const leftOver = incomeCents === null ? null : incomeCents - plannedCents
  const remainderCents = remainder && leftOver !== null ? Math.max(0, leftOver) : null
  const remainderLine: BudgetLine[] = remainder
    ? [{ categoryId: remainder.id, monthlyCents: remainderCents, notSet: false }]
    : []

  // Keep the lines in the same order as the categories
  const byId = new Map([...others, ...remainderLine].map((line) => [line.categoryId, line]))
  return {
    lines: categories.map((c) => byId.get(c.id)!),
    plannedCents,
    remainderCents,
    overPlannedCents: leftOver !== null && leftOver < 0 ? -leftOver : 0,
  }
}
