import type { Database } from './db.ts'
import { ValidationError } from './errors.ts'

export type Transaction = {
  id: string
  date: string // YYYY-MM-DD
  description: string
  // Whole cents. Positive = money spent, negative = money back (e.g. a refund).
  amountCents: number
  categoryId: string | null
}

export type TransactionInput = Omit<Transaction, 'id'>
export type TransactionChanges = Partial<TransactionInput>

// Reads and writes a user's transactions. Every method is scoped to one user, so a user can
// never see or change another user's transactions.
export type TransactionStore = {
  // The month's transactions, newest first. month = YYYY-MM.
  listByMonth(userId: string, month: string): Promise<Transaction[]>
  // Throws ValidationError if categoryId isn't one of the user's categories
  create(userId: string, input: TransactionInput): Promise<Transaction>
  // Returns null if the transaction doesn't exist or belongs to another user
  update(userId: string, id: string, changes: TransactionChanges): Promise<Transaction | null>
  // Returns false if the transaction doesn't exist or belongs to another user
  delete(userId: string, id: string): Promise<boolean>
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

const fields = { id: true, date: true, description: true, amountCents: true, categoryId: true } as const

type Row = { id: string; date: Date; description: string; amountCents: number; categoryId: string | null }

const toTransaction = (row: Row): Transaction => ({ ...row, date: fromDay(row.date) })

export function createTransactionStore(db: Database): TransactionStore {
  const checkCategory = async (userId: string, categoryId: string | null | undefined) => {
    if (!categoryId) return
    const category = await db.category.findFirst({ where: { id: categoryId, userId } })
    if (!category) throw new ValidationError(CATEGORY_NOT_FOUND)
  }

  return {
    listByMonth: async (userId, month) => {
      const { start, end } = monthRange(month)
      const rows = await db.transaction.findMany({
        where: { userId, date: { gte: start, lt: end } },
        select: fields,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      })
      return rows.map(toTransaction)
    },

    create: async (userId, input) => {
      await checkCategory(userId, input.categoryId)
      const row = await db.transaction.create({
        data: { userId, ...input, date: toDay(input.date) },
        select: fields,
      })
      return toTransaction(row)
    },

    update: async (userId, id, changes) => {
      const existing = await db.transaction.findFirst({ where: { id, userId } })
      if (!existing) return null
      await checkCategory(userId, changes.categoryId)
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
  }
}
