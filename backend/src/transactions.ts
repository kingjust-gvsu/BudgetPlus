import { ACCOUNT_NOT_FOUND, defaultAccountId } from './accounts.ts'
import type { Database } from './db.ts'
import { ValidationError } from './errors.ts'

export type Transaction = {
  id: string
  date: string // YYYY-MM-DD
  description: string
  // Whole cents. Positive = money spent, negative = money back (e.g. a refund).
  amountCents: number
  categoryId: string | null
  accountId: string
  // Set for a transfer: the amount moved from accountId to this account. Transfers aren't spending,
  // so they never have a category.
  transferAccountId: string | null
}

// Leaving out the account puts the transaction in the user's main bank account
export type TransactionInput = Omit<Transaction, 'id' | 'accountId' | 'transferAccountId'> & {
  accountId?: string
  transferAccountId?: string | null
}
export type TransactionChanges = Partial<TransactionInput>

export const TRANSFER_HAS_CATEGORY = "A transfer between accounts can't have a category"
export const TRANSFER_SAME_ACCOUNT = 'A transfer has to go to a different account'

// Making a transaction a transfer clears its category, and giving it a category makes it a plain
// transaction again. Throws ValidationError when a change asks for both.
export function settleTransferChange(changes: TransactionChanges): TransactionChanges {
  if (changes.transferAccountId && changes.categoryId) throw new ValidationError(TRANSFER_HAS_CATEGORY)
  if (changes.transferAccountId) return { ...changes, categoryId: null }
  if (changes.categoryId) return { ...changes, transferAccountId: null }
  return changes
}

// Throws ValidationError for a transfer from an account to itself
export function checkTransferAccounts(t: { accountId: string; transferAccountId?: string | null }) {
  if (t.transferAccountId && t.transferAccountId === t.accountId) throw new ValidationError(TRANSFER_SAME_ACCOUNT)
}

// Reads and writes a user's transactions. Every method is scoped to one user, so a user can
// never see or change another user's transactions.
export type TransactionStore = {
  // The user's transactions, newest first: just one month's (month = YYYY-MM), or all of them
  list(userId: string, month?: string): Promise<Transaction[]>
  // Throws ValidationError if categoryId or accountId isn't one of the user's
  create(userId: string, input: TransactionInput): Promise<Transaction>
  // Returns null if the transaction doesn't exist or belongs to another user
  update(userId: string, id: string, changes: TransactionChanges): Promise<Transaction | null>
  // Returns false if the transaction doesn't exist or belongs to another user
  delete(userId: string, id: string): Promise<boolean>
  // Adds many transactions at once (e.g. from a bank CSV), all or none. Skips ones the user
  // already has (same date, description, and amount), so importing a file twice is safe.
  // Throws ValidationError if any categoryId or accountId isn't one of the user's.
  importMany(userId: string, inputs: TransactionInput[]): Promise<ImportResult>
}

export type ImportResult = {
  imported: number
  // Already in the user's transactions, so not added again
  duplicates: number
}

type Comparable = { date: string; description: string; amountCents: number }

// Same date, description, and amount counts as the same transaction
export const duplicateKey = (t: Comparable) => `${t.date}|${t.description.toLowerCase()}|${t.amountCents}`

// The inputs that aren't already among `existing`. Uses counts, so two identical coffees on the
// same day in a file only skip as many as the user already has.
export function withoutDuplicates<T extends Comparable>(inputs: T[], existing: Comparable[]): T[] {
  const remaining = new Map<string, number>()
  for (const t of existing) remaining.set(duplicateKey(t), (remaining.get(duplicateKey(t)) ?? 0) + 1)
  return inputs.filter((t) => {
    const count = remaining.get(duplicateKey(t)) ?? 0
    if (count === 0) return true
    remaining.set(duplicateKey(t), count - 1)
    return false
  })
}

export const CATEGORY_NOT_FOUND = 'Category not found'

// Dates are stored as calendar days; using UTC midnight keeps them from shifting by time zone.
const toDay = (date: string) => new Date(`${date}T00:00:00Z`)
const fromDay = (date: Date) => date.toISOString().slice(0, 10)

export function monthRange(month: string) {
  const start = toDay(`${month}-01`)
  const end = new Date(start)
  end.setUTCMonth(end.getUTCMonth() + 1)
  return { start, end }
}

const fields = { id: true, date: true, description: true, amountCents: true, categoryId: true, accountId: true, transferAccountId: true } as const

type Row = {
  id: string
  date: Date
  description: string
  amountCents: number
  categoryId: string | null
  accountId: string
  transferAccountId: string | null
}

const toTransaction = (row: Row): Transaction => ({ ...row, date: fromDay(row.date) })

export function createTransactionStore(db: Database): TransactionStore {
  const checkCategory = async (userId: string, categoryId: string | null | undefined) => {
    if (!categoryId) return
    const category = await db.category.findFirst({ where: { id: categoryId, userId } })
    if (!category) throw new ValidationError(CATEGORY_NOT_FOUND)
  }
  const checkAccount = async (userId: string, accountId: string | null | undefined) => {
    if (!accountId) return
    if ((await db.account.count({ where: { id: accountId, userId } })) === 0) throw new ValidationError(ACCOUNT_NOT_FOUND)
  }

  return {
    list: async (userId, month) => {
      const range = month ? monthRange(month) : null
      const rows = await db.transaction.findMany({
        where: { userId, ...(range && { date: { gte: range.start, lt: range.end } }) },
        select: fields,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      })
      return rows.map(toTransaction)
    },

    create: async (userId, rawInput) => {
      const input = settleTransferChange(rawInput) as TransactionInput
      await checkCategory(userId, input.categoryId)
      await checkAccount(userId, input.accountId)
      await checkAccount(userId, input.transferAccountId)
      const accountId = input.accountId ?? (await defaultAccountId(db, userId, input.date))
      checkTransferAccounts({ accountId, transferAccountId: input.transferAccountId })
      const row = await db.transaction.create({
        data: { userId, ...input, accountId, date: toDay(input.date) },
        select: fields,
      })
      return toTransaction(row)
    },

    update: async (userId, id, rawChanges) => {
      const existing = await db.transaction.findFirst({ where: { id, userId } })
      if (!existing) return null
      const changes = settleTransferChange(rawChanges)
      await checkCategory(userId, changes.categoryId)
      await checkAccount(userId, changes.accountId)
      await checkAccount(userId, changes.transferAccountId)
      checkTransferAccounts({ ...existing, ...changes } as { accountId: string; transferAccountId: string | null })
      const row = await db.transaction.update({
        where: { id },
        data: { ...changes, date: changes.date ? toDay(changes.date) : undefined },
        select: fields,
      })
      return toTransaction(row)
    },

    delete: async (userId, id) => {
      const { count } = await db.transaction.deleteMany({ where: { id, userId } })
      return count > 0
    },

    importMany: async (userId, rawInputs) => {
      if (rawInputs.length === 0) return { imported: 0, duplicates: 0 }
      const inputs = rawInputs.map((t) => settleTransferChange(t) as TransactionInput)

      const categoryIds = [...new Set(inputs.map((t) => t.categoryId).filter((id): id is string => id !== null))]
      if (categoryIds.length > 0) {
        const owned = await db.category.count({ where: { userId, id: { in: categoryIds } } })
        if (owned !== categoryIds.length) throw new ValidationError(CATEGORY_NOT_FOUND)
      }
      const accountIds = [...new Set(inputs.flatMap((t) => [t.accountId, t.transferAccountId]).filter((id): id is string => !!id))]
      if (accountIds.length > 0) {
        const owned = await db.account.count({ where: { userId, id: { in: accountIds } } })
        if (owned !== accountIds.length) throw new ValidationError(ACCOUNT_NOT_FOUND)
      }

      // Look for duplicates among the user's transactions in the same date range
      const dates = inputs.map((t) => t.date).sort()
      const existingRows = await db.transaction.findMany({
        where: { userId, date: { gte: toDay(dates[0]), lte: toDay(dates.at(-1)!) } },
        select: { date: true, description: true, amountCents: true },
      })
      const existing = existingRows.map((row) => ({ ...row, date: fromDay(row.date) }))
      const toAdd = withoutDuplicates(inputs, existing)

      // One statement, so the import either fully happens or not at all
      const fallback = toAdd.some((t) => !t.accountId) ? await defaultAccountId(db, userId, dates[0]) : undefined
      for (const t of toAdd) checkTransferAccounts({ accountId: t.accountId ?? fallback!, transferAccountId: t.transferAccountId })
      await db.transaction.createMany({
        data: toAdd.map((t) => ({ userId, ...t, accountId: t.accountId ?? fallback!, date: toDay(t.date) })),
      })
      return { imported: toAdd.length, duplicates: inputs.length - toAdd.length }
    },
  }
}
