import type { Account, Category, Transaction, TransactionInput } from './api/types'
import { parseDollars } from './money'

// The Category picker also lists the other accounts, for transfers: its value is a category id,
// '' for uncategorized, or "transfer:<account id>" for a transfer to that account.
const TRANSFER = 'transfer:'

export const transferChoice = (accountId: string) => `${TRANSFER}${accountId}`

// The picker's value for a transaction
export function categoryChoiceOf(transaction: Pick<Transaction, 'categoryId' | 'transferAccountId'>): string {
  if (transaction.transferAccountId) return transferChoice(transaction.transferAccountId)
  return transaction.categoryId ?? ''
}

// What the add form and the editable row have in their fields
export type TransactionFields = {
  date: string
  description: string
  accountId: string // '' when the user has no accounts yet (the API picks their main one)
  categoryChoice: string // see above
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
  const transferAccountId = fields.categoryChoice.startsWith(TRANSFER) ? fields.categoryChoice.slice(TRANSFER.length) : null
  if (transferAccountId && transferAccountId === fields.accountId) {
    return { error: 'A transfer has to go to a different account.' }
  }
  return {
    input: {
      date: fields.date,
      description: fields.description.trim(),
      amountCents,
      categoryId: transferAccountId ? null : fields.categoryChoice || null,
      transferAccountId,
      ...(fields.accountId && { accountId: fields.accountId }),
    },
  }
}

// How a transaction shows in the Category column: its category, or where a transfer went.
// Seen from the account a transfer went into, it's money coming from the other account.
export function categoryLabel(
  transaction: Pick<Transaction, 'categoryId' | 'accountId' | 'transferAccountId'>,
  categories: Category[],
  accounts: Account[],
  viewingAccountId?: string,
): string | null {
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? 'another account'
  if (transaction.transferAccountId) {
    if (viewingAccountId === transaction.transferAccountId) return `Transfer from ${accountName(transaction.accountId)}`
    return `Transfer to ${accountName(transaction.transferAccountId)}`
  }
  return categories.find((c) => c.id === transaction.categoryId)?.name ?? null
}
