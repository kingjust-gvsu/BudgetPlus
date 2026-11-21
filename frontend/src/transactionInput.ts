import type { Account, Category, IncomeSourceName, Transaction, TransactionInput } from './api/types'
import { formatCents, parseDollars } from './money'

// The Category picker also lists the other accounts (for transfers) and income sources (for
// money in). Its value is a category id, '' for uncategorized, "transfer:<account id>",
// "income:<source id>", or "income:other".
const TRANSFER = 'transfer:'
const INCOME = 'income:'
export const OTHER_INCOME = 'other'

export const transferChoice = (accountId: string) => `${TRANSFER}${accountId}`
export const incomeChoice = (sourceId: string) => `${INCOME}${sourceId}`

type Kind = Pick<Transaction, 'categoryId' | 'transferAccountId' | 'incomeSourceId' | 'isOtherIncome'>

export const isIncome = (t: Pick<Transaction, 'incomeSourceId' | 'isOtherIncome'>) => t.incomeSourceId !== null || t.isOtherIncome

// The picker's value for a transaction
export function categoryChoiceOf(transaction: Kind): string {
  if (transaction.transferAccountId) return transferChoice(transaction.transferAccountId)
  if (transaction.incomeSourceId) return incomeChoice(transaction.incomeSourceId)
  if (transaction.isOtherIncome) return incomeChoice(OTHER_INCOME)
  return transaction.categoryId ?? ''
}

// Income is money in, which the API keeps as a negative amount; on screen it's typed and shown
// as a positive one. Everything else is shown as stored.
export const amountForScreen = (t: Pick<Transaction, 'amountCents' | 'incomeSourceId' | 'isOtherIncome'>) =>
  isIncome(t) ? -t.amountCents : t.amountCents

// "+$2,534.83" for income, "$84.12" for spending, "-$18.00" for money back
export function formatAmount(t: Pick<Transaction, 'amountCents' | 'incomeSourceId' | 'isOtherIncome'>): string {
  const cents = amountForScreen(t)
  return isIncome(t) && cents > 0 ? `+${formatCents(cents)}` : formatCents(cents)
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
  const typedCents = parseDollars(fields.amount)
  if (typedCents === null || typedCents === 0) {
    return { error: 'Enter an amount like 12.34. Use a minus sign for a refund.' }
  }
  const choice = fields.categoryChoice
  const transferAccountId = choice.startsWith(TRANSFER) ? choice.slice(TRANSFER.length) : null
  const income = choice.startsWith(INCOME) ? choice.slice(INCOME.length) : null
  if (transferAccountId && transferAccountId === fields.accountId) {
    return { error: 'A transfer has to go to a different account.' }
  }
  return {
    input: {
      date: fields.date,
      description: fields.description.trim(),
      // Income is typed as a positive amount but kept as money in
      amountCents: income ? -typedCents : typedCents,
      categoryId: transferAccountId || income ? null : choice || null,
      transferAccountId,
      incomeSourceId: income && income !== OTHER_INCOME ? income : null,
      isOtherIncome: income === OTHER_INCOME,
      ...(fields.accountId && { accountId: fields.accountId }),
    },
  }
}

// The names a transaction's Category column can show
export type Names = { categories: Category[]; accounts: Account[]; incomeSources: IncomeSourceName[] }

// How a transaction shows in the Category column: its category, where a transfer went, or which
// income it is. Seen from the account a transfer went into, it's money coming from the other account.
export function categoryLabel(transaction: Kind & Pick<Transaction, 'accountId'>, names: Names, viewingAccountId?: string): string | null {
  const accountName = (id: string) => names.accounts.find((a) => a.id === id)?.name ?? 'another account'
  if (transaction.transferAccountId) {
    if (viewingAccountId === transaction.transferAccountId) return `Transfer from ${accountName(transaction.accountId)}`
    return `Transfer to ${accountName(transaction.transferAccountId)}`
  }
  if (transaction.incomeSourceId) {
    return `Income: ${names.incomeSources.find((s) => s.id === transaction.incomeSourceId)?.name ?? 'a removed source'}`
  }
  if (transaction.isOtherIncome) return 'Other income'
  return names.categories.find((c) => c.id === transaction.categoryId)?.name ?? null
}
