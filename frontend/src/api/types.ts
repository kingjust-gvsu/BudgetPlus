// Shapes of the data the API sends and receives.

export type User = {
  id: string
  email: string | null
}

// GET /api/income?month=: a month's income. `sources` are the ones paying that month, each
// carried over from the month it was last set in (`setIn`); other income is for that month only.
export type MonthIncome = {
  month: string
  sources: { id: string; name: string; amountCents: number; setIn: string }[]
  otherCents: number
  totalCents: number | null // null when there's no income at all yet
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
  accountId: string
  // For a transfer: the amount moved from accountId to this account. Transfers have no category
  // and aren't spending.
  transferAccountId: string | null
}

// Without an account, the API puts a transaction in the main bank account
export type TransactionInput = Omit<Transaction, 'id' | 'accountId' | 'transferAccountId'> & {
  accountId?: string
  transferAccountId?: string | null
}

// GET /api/accounts: where money is kept, each with its balance. Balances are what you have, so a
// credit card's is negative (what you owe).
export type AccountType = 'BANK' | 'CREDIT_CARD' | 'FUND'

export type AccountInput = {
  name: string
  type: AccountType
  startingBalanceCents: number
  startDate: string // YYYY-MM-DD: the day the starting balance is from
}

export type Account = AccountInput & {
  id: string
  balanceCents: number // the starting balance plus everything from the start date on
}

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
  frequencyMonths: number // how often it's due, e.g. 6
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

// GET /api/spending: totals for the spending charts
export type MonthSpending = {
  month: string // YYYY-MM
  billsCents: number
  expensesCents: number // includes uncategorized spending
  incomeCents: number | null // that month's income
}

export type CategorySpending = {
  id: string | null // null = uncategorized
  name: string
  kind: CategoryKind | null
  spentCents: number
  byMonthCents: number[] // same order as `months`
}

export type SpendingSummary = {
  months: MonthSpending[]
  categories: CategorySpending[] // largest first
}
