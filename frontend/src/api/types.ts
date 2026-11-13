// Shapes of the data the API sends and receives.

export type User = {
  id: string
  email: string | null
  monthlyIncomeCents: number | null // null until the user enters it
}

export type CategoryKind = 'BILL' | 'EXPENSE'

// How a category's monthly amount is decided. Bills always use FIXED (their estimate).
export type BudgetType = 'FIXED' | 'PERCENT_OF_INCOME' | 'REMAINDER'

export type BudgetSettings = {
  budgetType: BudgetType
  budgetCents: number | null // FIXED: the amount; for a bill, the estimate each time it's due
  budgetPercent: number | null // PERCENT_OF_INCOME: e.g. 12.5 for 12.5%
  frequencyMonths: number // bills only: 1 = monthly, 6 = every 6 months
  nextDueDate: string | null // bills only: YYYY-MM-DD, required when not monthly
}

export type Category = {
  id: string
  name: string
  kind: CategoryKind
} & BudgetSettings

export type CategoryChanges = Partial<Omit<Category, 'id'>>

export type Transaction = {
  id: string
  date: string // YYYY-MM-DD
  description: string
  amountCents: number // positive = spent, negative = money back
  categoryId: string | null
}

export type TransactionInput = Omit<Transaction, 'id'>

// GET /api/summary?month=YYYY-MM: one month at a glance

export type ExpenseStatus = {
  type: 'expense'
  limitCents: number | null
  spentCents: number
  leftCents: number | null // negative when over
  state: 'under' | 'over' | 'noLimit'
}

export type BillStatus = {
  type: 'bill'
  estimateCents: number | null
  paidCents: number
  differenceCents: number // paid minus estimate once paid; positive = came in higher
  state: 'paid' | 'pending'
}

export type FundMonth = {
  setAsideCents: number
  balanceCents: number
  nextDueDate: string // YYYY-MM-DD
  monthsLeft: number
  paidCents: number
  remainderChangeCents: number
}

// A bill paid every few months, saved for monthly
export type FundBillStatus = {
  type: 'fundBill'
  setAsideCents: number | null
  targetCents: number | null // the full bill the fund is saving toward
  fund?: FundMonth
}

export type CategorySummary = Pick<Category, 'id' | 'name' | 'kind' | 'budgetType'> &
  (ExpenseStatus | BillStatus | FundBillStatus)

export type MonthSummary = {
  month: string
  incomeCents: number | null
  remainderCents: number | null
  overPlannedCents: number
  billDifferenceCents: number
  uncategorizedCents: number
  totals: {
    billsPlannedCents: number
    billsPaidCents: number
    monthlyBillsPaid: number
    monthlyBills: number
    expensesLimitCents: number
    expensesSpentCents: number
  }
  categories: CategorySummary[]
}
