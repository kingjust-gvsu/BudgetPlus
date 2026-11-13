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
