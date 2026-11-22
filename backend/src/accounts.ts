import type { Database } from './db.ts'
import { ConflictError, ValidationError } from './errors.ts'

// Where money is kept: a bank account, a credit card, or a bucket (money set aside for
// something, like car insurance). Every transaction belongs to one account. A bucket can sit in a
// bank account: then the bank account's total is its own balance plus its buckets'.

export const ACCOUNT_TYPES = ['BANK', 'CREDIT_CARD', 'FUND'] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

export type AccountInput = {
  name: string
  type: AccountType
  // What the account had on the start date. Balances are what you have, so a credit card's is
  // negative: what you owe.
  startingBalanceCents: number
  startDate: string // YYYY-MM-DD
  // No longer used: it keeps its transactions but isn't offered for new ones. Left out = open.
  closed?: boolean
  // Buckets only: the bank account it sits in. Left out = none.
  parentAccountId?: string | null
}

export type Account = AccountInput & {
  id: string
  closed: boolean
  parentAccountId: string | null
  // The starting balance plus everything from the start date on: less what was spent or moved
  // out, plus what was moved in
  balanceCents: number
}

export type AccountChanges = Partial<AccountInput>

export const ACCOUNT_NAME_TAKEN = 'You already have an account with that name'
export const ACCOUNT_HAS_TRANSACTIONS = 'This account has transactions or transfers. Move or delete them first.'
export const ACCOUNT_NOT_FOUND = 'Account not found'
export const ONLY_BUCKETS_GO_IN_ACCOUNTS = 'Only a bucket can go in another account'
export const BUCKETS_GO_IN_BANK_ACCOUNTS = 'A bucket can only go in a bank account'
export const ACCOUNT_HAS_BUCKETS = 'This account has buckets in it. Move or delete them first.'

type BucketFields = { id: string; type: AccountType; parentAccountId: string | null }

// Throws if `account` (as it would be after a change) breaks the bucket rules: only a bucket goes
// in another account, only into one of the user's bank accounts, and a bank account with buckets
// in it stays a bank account. `others` are the user's other accounts.
export function checkBuckets(account: BucketFields, others: BucketFields[]): void {
  if (account.parentAccountId !== null) {
    if (account.type !== 'FUND') throw new ValidationError(ONLY_BUCKETS_GO_IN_ACCOUNTS)
    const parent = others.find((a) => a.id === account.parentAccountId)
    if (!parent) throw new ValidationError(ACCOUNT_NOT_FOUND)
    if (parent.type !== 'BANK') throw new ValidationError(BUCKETS_GO_IN_BANK_ACCOUNTS)
  }
  if (account.type !== 'BANK' && others.some((a) => a.parentAccountId === account.id)) {
    throw new ConflictError(ACCOUNT_HAS_BUCKETS)
  }
}

// A change that turns a bucket into another type takes it out of its bank account
export function settleParent(type: AccountType, changes: AccountChanges): AccountChanges {
  return type !== 'FUND' && changes.parentAccountId === undefined ? { ...changes, parentAccountId: null } : changes
}

// Used when a transaction doesn't say which account it's in and the user has no accounts yet
export const DEFAULT_ACCOUNT_NAME = 'Checking'

type BalanceTransaction = { date: string; amountCents: number; accountId: string; transferAccountId: string | null }

// Transactions count from the start date on. A transaction's amount is money spent (positive) or
// money back (negative), so spending lowers the balance. A transfer's amount moves out of its
// account and into the account it's transferred to.
export function balanceOf(account: Pick<Account, 'id' | 'startingBalanceCents' | 'startDate'>, transactions: BalanceTransaction[]): number {
  return transactions
    .filter((t) => t.date >= account.startDate)
    .reduce((balance, t) => {
      if (t.accountId === account.id) return balance - t.amountCents
      if (t.transferAccountId === account.id) return balance + t.amountCents
      return balance
    }, account.startingBalanceCents)
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
  // These throw ConflictError for a name the user already has, and break the bucket rules
  // (see checkBuckets) with ValidationError or ConflictError
  create(userId: string, input: AccountInput): Promise<Account>
  // Returns null if the account doesn't exist or belongs to another user
  update(userId: string, id: string, changes: AccountChanges): Promise<Account | null>
  // Returns false if the account doesn't exist or belongs to another user. Throws ConflictError
  // if it still has transactions or buckets in it.
  delete(userId: string, id: string): Promise<boolean>
}

const isUniqueViolation = (error: unknown) => (error as { code?: string })?.code === 'P2002'
const toDay = (date: string) => new Date(`${date}T00:00:00Z`)
const fromDay = (date: Date) => date.toISOString().slice(0, 10)

const fields = { id: true, name: true, type: true, startingBalanceCents: true, startDate: true, closed: true, parentAccountId: true } as const
type Row = { id: string; name: string; type: AccountType; startingBalanceCents: number; startDate: Date; closed: boolean; parentAccountId: string | null }

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
  // Adds the balance: the starting balance, less what was spent or moved out from the start date
  // on, plus what was moved in
  const withBalance = async (row: Row): Promise<Account> => {
    const since = { gte: row.startDate }
    const [out, moved] = await Promise.all([
      db.transaction.aggregate({ where: { accountId: row.id, date: since }, _sum: { amountCents: true } }),
      db.transaction.aggregate({ where: { transferAccountId: row.id, date: since }, _sum: { amountCents: true } }),
    ])
    const balanceCents = row.startingBalanceCents - (out._sum.amountCents ?? 0) + (moved._sum.amountCents ?? 0)
    return { ...row, startDate: fromDay(row.startDate), balanceCents }
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
      const others = await db.account.findMany({ where: { userId }, select: { id: true, type: true, parentAccountId: true } })
      checkBuckets({ id: '', type: input.type, parentAccountId: input.parentAccountId ?? null }, others)
      const row = await named(() =>
        db.account.create({ data: { userId, ...input, startDate: toDay(input.startDate) }, select: fields }),
      )
      return withBalance(row)
    },

    update: async (userId, id, requested) => {
      const existing = await db.account.findFirst({ where: { id, userId }, select: { type: true, parentAccountId: true } })
      if (!existing) return null
      const type = requested.type ?? existing.type
      const changes = settleParent(type, requested)
      const others = await db.account.findMany({ where: { userId, id: { not: id } }, select: { id: true, type: true, parentAccountId: true } })
      checkBuckets({ id, type, parentAccountId: changes.parentAccountId !== undefined ? changes.parentAccountId : existing.parentAccountId }, others)
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
      if ((await db.account.count({ where: { parentAccountId: id } })) > 0) throw new ConflictError(ACCOUNT_HAS_BUCKETS)
      const used = await db.transaction.count({ where: { OR: [{ accountId: id }, { transferAccountId: id }] } })
      if (used > 0) throw new ConflictError(ACCOUNT_HAS_TRANSACTIONS)
      await db.account.delete({ where: { id } })
      return true
    },
  }
}
