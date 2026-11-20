import type { Category, CategoryKind } from './categories.ts'
import type { Transaction } from './transactions.ts'

// How much was spent over a run of months, for the spending charts: totals for each month
// (bills and expenses), and totals for each category across all of the months.

export type MonthSpending = {
  month: string // YYYY-MM
  billsCents: number
  // Expense categories plus uncategorized spending
  expensesCents: number
}

export type CategorySpending = {
  id: string | null // null = uncategorized
  name: string
  kind: CategoryKind | null
  spentCents: number
  // What was spent in each month, in the same order as `months`
  byMonthCents: number[]
}

export type SpendingSummary = {
  months: MonthSpending[]
  // Largest first; categories with nothing spent are left out
  categories: CategorySpending[]
}

const pad = (n: number) => String(n).padStart(2, '0')

// The `count` months ending with `last`, oldest first: monthsEnding('2026-02', 3) → 2025-12, 2026-01, 2026-02
export function monthsEnding(last: string, count: number): string[] {
  const [year, month] = last.split('-').map(Number)
  const lastIndex = year * 12 + (month - 1)
  return Array.from({ length: count }, (_, i) => {
    const index = lastIndex - (count - 1 - i)
    return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`
  })
}

export function spendingSummary(
  months: string[],
  categories: Pick<Category, 'id' | 'name' | 'kind'>[],
  transactions: Pick<Transaction, 'date' | 'amountCents' | 'categoryId'>[],
): SpendingSummary {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const byMonth = new Map(months.map((month) => [month, { month, billsCents: 0, expensesCents: 0 }]))
  const monthIndex = new Map(months.map((month, i) => [month, i]))
  const byCategory = new Map<string | null, CategorySpending>()

  for (const t of transactions) {
    const month = byMonth.get(t.date.slice(0, 7))
    if (!month) continue // outside the months asked for
    const category = t.categoryId ? byId.get(t.categoryId) : undefined
    if (category?.kind === 'BILL') month.billsCents += t.amountCents
    else month.expensesCents += t.amountCents

    const key = category?.id ?? null
    const total = byCategory.get(key) ?? {
      id: key,
      name: category?.name ?? 'Uncategorized',
      kind: category?.kind ?? null,
      spentCents: 0,
      byMonthCents: months.map(() => 0),
    }
    total.spentCents += t.amountCents
    total.byMonthCents[monthIndex.get(month.month)!] += t.amountCents
    byCategory.set(key, total)
  }

  return {
    months: [...byMonth.values()],
    categories: [...byCategory.values()]
      .filter((c) => c.spentCents > 0)
      .sort((a, b) => b.spentCents - a.spentCents || a.name.localeCompare(b.name)),
  }
}
