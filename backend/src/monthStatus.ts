import { planBudget } from './budget.ts'
import type { Category } from './categories.ts'

// Where each category stands partway through a month: expenses against their limits (shown
// green or red), bills against their estimates (always neutral), and the remainder after bills
// that came in higher or lower than expected.

type MonthTransaction = { categoryId: string | null; amountCents: number }

export type ExpenseStatus = {
  type: 'expense'
  categoryId: string
  limitCents: number | null
  spentCents: number
  leftCents: number | null // negative when over
  state: 'under' | 'over' | 'noLimit'
}

export type BillStatus = {
  type: 'bill'
  categoryId: string
  estimateCents: number | null
  paidCents: number
  // Paid minus estimate once paid (positive = came in higher); 0 while pending
  differenceCents: number
  state: 'paid' | 'pending'
}

// A bill paid every few months: saved for monthly, paid from its fund (see the fund calculations)
export type FundBillStatus = {
  type: 'fundBill'
  categoryId: string
  setAsideCents: number | null
}

export type CategoryStatus = ExpenseStatus | BillStatus | FundBillStatus

export type MonthStatus = {
  categories: CategoryStatus[]
  // The remainder after bill differences; null with no income or no remainder category
  remainderCents: number | null
  // How much higher (positive) or lower (negative) paid bills came in than estimated
  billDifferenceCents: number
  // Spending not yet put in a category
  uncategorizedCents: number
}

function expenseStatus(categoryId: string, limitCents: number | null, spentCents: number): ExpenseStatus {
  if (limitCents === null) return { type: 'expense', categoryId, limitCents, spentCents, leftCents: null, state: 'noLimit' }
  const leftCents = limitCents - spentCents
  return { type: 'expense', categoryId, limitCents, spentCents, leftCents, state: leftCents < 0 ? 'over' : 'under' }
}

export function monthStatus(incomeCents: number | null, categories: Category[], transactions: MonthTransaction[]): MonthStatus {
  const plan = planBudget(incomeCents, categories)
  const planned = new Map(plan.lines.map((line) => [line.categoryId, line.monthlyCents]))

  const spent = new Map<string, number>()
  let uncategorizedCents = 0
  for (const { categoryId, amountCents } of transactions) {
    if (categoryId === null) uncategorizedCents += amountCents
    else spent.set(categoryId, (spent.get(categoryId) ?? 0) + amountCents)
  }

  // Bills first, since their differences change what the remainder gets
  const bills = new Map<string, CategoryStatus>()
  let billDifferenceCents = 0
  for (const category of categories.filter((c) => c.kind === 'BILL')) {
    if (category.frequencyMonths > 1) {
      bills.set(category.id, { type: 'fundBill', categoryId: category.id, setAsideCents: planned.get(category.id) ?? null })
      continue
    }
    const paidCents = spent.get(category.id) ?? 0
    const estimateCents = category.budgetCents
    const paid = paidCents !== 0
    const differenceCents = paid && estimateCents !== null ? paidCents - estimateCents : 0
    billDifferenceCents += differenceCents
    bills.set(category.id, {
      type: 'bill',
      categoryId: category.id,
      estimateCents,
      paidCents,
      differenceCents,
      state: paid ? 'paid' : 'pending',
    })
  }

  // A bill that came in higher leaves less for the remainder; one that came in lower leaves more
  const remainderCents = plan.remainderCents === null ? null : Math.max(0, plan.remainderCents - billDifferenceCents)

  const statuses = categories.map((category): CategoryStatus => {
    const bill = bills.get(category.id)
    if (bill) return bill
    const limit = category.budgetType === 'REMAINDER' ? remainderCents : (planned.get(category.id) ?? null)
    return expenseStatus(category.id, limit, spent.get(category.id) ?? 0)
  })

  return { categories: statuses, remainderCents, billDifferenceCents, uncategorizedCents }
}
