// Shapes of the data the API sends and receives.

export type CategoryKind = 'BILL' | 'EXPENSE'

export type Category = {
  id: string
  name: string
  kind: CategoryKind
}

export type Transaction = {
  id: string
  date: string // YYYY-MM-DD
  description: string
  amountCents: number // positive = spent, negative = money back
  categoryId: string | null
}

export type TransactionInput = Omit<Transaction, 'id'>
