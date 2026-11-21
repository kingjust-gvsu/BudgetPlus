import type { Database } from './db.ts'
import { ConflictError } from './errors.ts'

// Where money is kept: a bank account, a credit card, or a savings fund (money set aside for
// something, like car insurance). Every transaction belongs to one account.

export const ACCOUNT_TYPES = ['BANK', 'CREDIT_CARD', 'FUND'] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

export type AccountInput = {
  name: string
  type: AccountType
  // What the account had on the start date. Balances are what you have, so a credit card's is
  // negative: what you owe.
  startingBalanceCents: number
  startDate: string // YYYY-MM-DD
}

export type Account = AccountInput & {
  id: string
  // The starting balance plus every transaction from the start date on
  balanceCents: number
}

export type AccountChanges = Partial<AccountInput>

export const ACCOUNT_NAME_TAKEN = 'You already have an account with that name'
export const ACCOUNT_HAS_TRANSACTIONS = 'This account has transactions. Move or delete them first.'
export const ACCOUNT_NOT_FOUND = 'Account not found'

// Used when a transaction doesn't say which account it's in and the user has no accounts yet
export const DEFAULT_ACCOUNT_NAME = 'Checking'

type BalanceTransaction = { date: string; amountCents: number }

// Transactions count from the start date on. A transaction's amount is money spent (positive) or
// money back (negative), so spending lowers the balance.
export function balanceOf(account: AccountInput, transactions: BalanceTransaction[]): number {
  return transactions
    .filter((t) => t.date >= account.startDate)
    .reduce((balance, t) => balance - t.amountCents, account.startingBalanceCents)
}

// Bank accounts first, then credit cards, then funds; by name within each
const TYPE_ORDER: Record<AccountType, number> = { BANK: 0, CREDIT_CARD: 1, FUND: 2 }
export function sortAccounts<T extends { type: AccountType; name: string }>(accounts: T[]): T[] {
  return [...accounts].sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.name.localeCompare(b.name))
}

// Reads and writes a user's accounts. Every method is scoped to one user.
export type AccountStore = {
  // With balances, in display order
  list(userId: string): Promise<Account[]>
  // These throw ConflictError for a name the user already has
  create(userId: string, input: AccountInput): Promise<Account>
  // Returns null if the account doesn't exist or belongs to another user
  update(userId: string, id: string, changes: AccountChanges): Promise<Account | null>
  // Returns false if the account doesn't exist or belongs to another user. Throws ConflictError
  // if it still has transactions.
  delete(userId: string, id: string): Promise<boolean>
}

const isUniqueViolation = (error: unknown) => (error as { code?: string })?.code === 'P2002'
const toDay = (date: string) => new Date(`${date}T00:00:00Z`)
const fromDay = (date: Date) => date.toISOString().slice(0, 10)

const fields = { id: true, name: true, type: true, startingBalanceCents: true, startDate: true } as const
type Row = { id: string; name: string; type: AccountType; startingBalanceCents: number; startDate: Date }

// The account a transaction goes in when it doesn't name one: the user's first bank account, or a
// new "Checking" account (starting at $0 on `date`) if they have none
export async function defaultAccountId(db: Database, userId: string, date: string): Promise<string> {
  const bank = await db.account.findFirst({ where: { userId, type: 'BANK' }, orderBy: { createdAt: 'asc' }, select: { id: true } })
  if (bank) return bank.id
  const existing = await db.account.findFirst({ where: { userId, name: DEFAULT_ACCOUNT_NAME }, select: { id: true } })
  if (existing) return existing.id
  const created = await db.account.create({
    data: { userId, name: DEFAULT_ACCOUNT_NAME, type: 'BANK', startingBalanceCents: 0, startDate: toDay(date) },
    select: { id: true },
  })
  return created.id
}

export function createAccountStore(db: Database): AccountStore {
  // Adds the balance: the starting balance, less what was spent from the start date on
  const withBalance = async (row: Row): Promise<Account> => {
    const { _sum } = await db.transaction.aggregate({
      where: { accountId: row.id, date: { gte: row.startDate } },
      _sum: { amountCents: true },
    })
    return { ...row, startDate: fromDay(row.startDate), balanceCents: row.startingBalanceCents - (_sum.amountCents ?? 0) }
  }

  const named = async <T>(write: () => Promise<T>) => {
    try {
      return await write()
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError(ACCOUNT_NAME_TAKEN)
      throw error
    }
  }

  return {
    list: async (userId) => {
      const rows = await db.account.findMany({ where: { userId }, select: fields })
      return sortAccounts(await Promise.all(rows.map(withBalance)))
    },

    create: async (userId, input) => {
      const row = await named(() =>
        db.account.create({ data: { userId, ...input, startDate: toDay(input.startDate) }, select: fields }),
      )
      return withBalance(row)
    },

    update: async (userId, id, changes) => {
      if ((await db.account.count({ where: { id, userId } })) === 0) return null
      const row = await named(() =>
        db.account.update({
          where: { id },
          data: { ...changes, startDate: changes.startDate ? toDay(changes.startDate) : undefined },
          select: fields,
        }),
      )
      return withBalance(row)
    },

    delete: async (userId, id) => {
      if ((await db.account.count({ where: { id, userId } })) === 0) return false
      if ((await db.transaction.count({ where: { accountId: id } })) > 0) throw new ConflictError(ACCOUNT_HAS_TRANSACTIONS)
      await db.account.delete({ where: { id } })
      return true
    },
  }
}
