import type { AccountType } from './api/types'
import { formatCents } from './money'

export const ACCOUNT_TYPE_NAMES: Record<AccountType, string> = {
  BANK: 'Bank account',
  CREDIT_CARD: 'Credit card',
  FUND: 'Bucket',
}

// Balances are what you have, so a credit card's is negative. On screen a card shows what you owe
// as a positive amount, and that's also what you type in for its starting balance.
export const showsOwed = (type: AccountType) => type === 'CREDIT_CARD'

// Between a stored balance and the amount shown or typed (they're the same except for cards)
export const flipForCard = (type: AccountType, cents: number) => (showsOwed(type) ? -cents : cents)

// "$1,250.00", "-$2,112.30" for a bucket below zero, "$240.00 owed" for a card
export function formatBalance(type: AccountType, cents: number): string {
  if (!showsOwed(type)) return formatCents(cents)
  if (cents <= 0) return `${formatCents(-cents)} owed`
  return `${formatCents(cents)} credit`
}
