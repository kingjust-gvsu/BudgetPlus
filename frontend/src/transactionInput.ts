import type { TransactionInput } from './api/types'
import { parseDollars } from './money'

// What the add form and the editable row have in their fields
export type TransactionFields = {
  date: string
  description: string
  categoryId: string // '' = uncategorized
  amount: string // as typed, in dollars
}

// Checks the fields and turns them into what the API expects, or explains what's wrong.
export function readTransactionFields(fields: TransactionFields): { input: TransactionInput } | { error: string } {
  if (!fields.description.trim()) {
    return { error: 'Enter a description.' }
  }
  const amountCents = parseDollars(fields.amount)
  if (amountCents === null || amountCents === 0) {
    return { error: 'Enter an amount like 12.34. Use a minus sign for a refund.' }
  }
  return {
    input: {
      date: fields.date,
      description: fields.description.trim(),
      amountCents,
      categoryId: fields.categoryId || null,
    },
  }
}
