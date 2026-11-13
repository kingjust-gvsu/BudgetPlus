import type { Category } from './categories.ts'
import type { Database } from './db.ts'
import { fundForMonth, type FundMonth } from './fund.ts'
import { monthStatus, type CategoryStatus } from './monthStatus.ts'
import { monthRange } from './transactions.ts'

// Everything the dashboard needs for one month, built from the budget, status, and fund
// calculations.

// A category plus the month it was added, which is when saving starts for a fund bill
export type SummaryCategory = Category & { startMonth: string }

export type SummaryData = {
  categories: SummaryCategory[]
  // This month's transactions
  transactions: { categoryId: string | null; amountCents: number }[]
  // What was paid toward each fund bill in each month, up to and including this one
  fundPayments: Map<string, Map<string, number>>
}

export type CategorySummary = Pick<Category, 'id' | 'name' | 'kind' | 'budgetType'> & CategoryStatus

export type MonthSummary = {
  month: string
  incomeCents: number | null
  // The remainder after bill differences; null with no income or no remainder category
  remainderCents: number | null
  // How far budgets (other than the remainder) go past income; 0 when they fit
  overPlannedCents: number
  // How much higher (positive) or lower (negative) paid bills came in than expected
  billDifferenceCents: number
  uncategorizedCents: number
  totals: {
    // Monthly bill estimates plus what's set aside for bills that aren't monthly
    billsPlannedCents: number
    // What's been paid toward monthly bills this month
    billsPaidCents: number
    monthlyBillsPaid: number
    monthlyBills: number
    // Expense limits and spending, not counting the remainder category
    expensesLimitCents: number
    expensesSpentCents: number
  }
  categories: CategorySummary[]
}

export function buildMonthSummary(month: string, incomeCents: number | null, data: SummaryData): MonthSummary {
  // Each fund bill's fund for this month, from its payment history
  const funds = new Map<string, FundMonth>()
  for (const category of data.categories) {
    if (category.kind !== 'BILL' || category.frequencyMonths <= 1) continue
    if (category.budgetCents === null || category.nextDueDate === null) continue
    const bill = {
      amountCents: category.budgetCents,
      frequencyMonths: category.frequencyMonths,
      nextDueDate: category.nextDueDate,
      startMonth: category.startMonth,
    }
    funds.set(category.id, fundForMonth(bill, data.fundPayments.get(category.id) ?? new Map(), month))
  }

  const status = monthStatus(incomeCents, data.categories, data.transactions, funds)
  const planned = status.categories

  const totals = {
    billsPlannedCents: 0,
    billsPaidCents: 0,
    monthlyBillsPaid: 0,
    monthlyBills: 0,
    expensesLimitCents: 0,
    expensesSpentCents: 0,
  }
  const categories = data.categories.map((category, i): CategorySummary => {
    const s = planned[i]
    if (s.type === 'bill') {
      totals.monthlyBills += 1
      totals.billsPlannedCents += s.estimateCents ?? 0
      totals.billsPaidCents += s.paidCents
      if (s.state === 'paid') totals.monthlyBillsPaid += 1
    } else if (s.type === 'fundBill') {
      totals.billsPlannedCents += s.setAsideCents ?? 0
    } else if (category.budgetType !== 'REMAINDER') {
      totals.expensesLimitCents += s.limitCents ?? 0
      totals.expensesSpentCents += s.spentCents
    }
    return { id: category.id, name: category.name, kind: category.kind, budgetType: category.budgetType, ...s }
  })

  // How far the plan goes past income, using the same set-asides the month uses
  const plannedCents = categories.reduce((sum, c) => {
    if (c.type === 'bill') return sum + (c.estimateCents ?? 0)
    if (c.type === 'fundBill') return sum + (c.setAsideCents ?? 0)
    return c.budgetType === 'REMAINDER' ? sum : sum + (c.limitCents ?? 0)
  }, 0)
  const overPlannedCents = incomeCents === null ? 0 : Math.max(0, plannedCents - incomeCents)

  return {
    month,
    incomeCents,
    remainderCents: status.remainderCents,
    overPlannedCents,
    billDifferenceCents: status.billDifferenceCents,
    uncategorizedCents: status.uncategorizedCents,
    totals,
    categories,
  }
}

// Loads what a month's summary is built from. Scoped to one user.
export type SummaryStore = {
  load(userId: string, month: string): Promise<SummaryData>
}

const toMonth = (date: Date) => date.toISOString().slice(0, 7)

export function createSummaryStore(db: Database): SummaryStore {
  return {
    load: async (userId, month) => {
      const { start, end } = monthRange(month)
      const rows = await db.category.findMany({ where: { userId }, orderBy: { name: 'asc' } })
      const categories: SummaryCategory[] = rows.map((row) => ({
        id: row.id,
        name: row.name,
        kind: row.kind,
        budgetType: row.budgetType,
        budgetCents: row.budgetCents,
        budgetPercent: row.budgetPercentHundredths === null ? null : row.budgetPercentHundredths / 100,
        frequencyMonths: row.frequencyMonths,
        nextDueDate: row.nextDueDate ? row.nextDueDate.toISOString().slice(0, 10) : null,
        startMonth: toMonth(row.createdAt),
      }))

      const transactions = await db.transaction.findMany({
        where: { userId, date: { gte: start, lt: end } },
        select: { categoryId: true, amountCents: true },
      })

      // Every payment toward a fund bill up to the end of this month, added up by month
      const fundIds = categories.filter((c) => c.kind === 'BILL' && c.frequencyMonths > 1).map((c) => c.id)
      const payments = fundIds.length
        ? await db.transaction.findMany({
            where: { userId, categoryId: { in: fundIds }, date: { lt: end } },
            select: { categoryId: true, date: true, amountCents: true },
          })
        : []
      const fundPayments = new Map<string, Map<string, number>>()
      for (const payment of payments) {
        const byMonth = fundPayments.get(payment.categoryId!) ?? new Map<string, number>()
        const m = toMonth(payment.date)
        byMonth.set(m, (byMonth.get(m) ?? 0) + payment.amountCents)
        fundPayments.set(payment.categoryId!, byMonth)
      }

      return { categories, transactions, fundPayments }
    },
  }
}
