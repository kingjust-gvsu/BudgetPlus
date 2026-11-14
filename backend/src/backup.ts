import {
  BUDGET_TYPES,
  CATEGORY_KINDS,
  categoryAfterChange,
  percentTotalError,
  SECOND_REMAINDER,
  type Category,
} from './categories.ts'
import type { Database } from './db.ts'
import { ValidationError } from './errors.ts'
import {
  nullable,
  requireBudgetCents,
  requireCents,
  requireDate,
  requireFrequencyMonths,
  requireObject,
  requireOneOf,
  requirePercent,
  requireText,
} from './validation.ts'

// A whole account's data in one file: income, categories with their budgets, and transactions.
// Transactions name their category rather than using database ids, so a backup can be restored
// into any account. Restoring replaces everything the user had.

export const BACKUP_FORMAT = 'budget-plus-backup'
export const BACKUP_VERSION = 1
const MAX_CATEGORIES = 500
const MAX_TRANSACTIONS = 20000

export type BackupCategory = Omit<Category, 'id'> & {
  // When the category was added; bills that aren't monthly start saving from here
  createdOn: string
}

export type BackupTransaction = {
  date: string
  description: string
  amountCents: number
  category: string | null // the category's name
}

export type Backup = {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  exportedAt: string
  monthlyIncomeCents: number | null
  categories: BackupCategory[]
  transactions: BackupTransaction[]
}

// Checks a backup file from the user against every rule the app enforces, so restoring it can't
// produce data the app wouldn't allow. Throws ValidationError naming the first problem found.
export function parseBackup(raw: unknown): Backup {
  const body = requireObject(raw)
  if (body.format !== BACKUP_FORMAT) throw new ValidationError("This isn't a Budget+ backup file")
  if (body.version !== BACKUP_VERSION) throw new ValidationError(`This backup is version ${String(body.version)}; only version ${BACKUP_VERSION} can be restored`)

  const monthlyIncomeCents = nullable(body.monthlyIncomeCents ?? null, (v) => requireBudgetCents(v, 'Monthly income'))

  if (!Array.isArray(body.categories)) throw new ValidationError('The backup has no categories list')
  if (body.categories.length > MAX_CATEGORIES) throw new ValidationError(`A backup can have at most ${MAX_CATEGORIES} categories`)
  const categories = body.categories.map((raw: unknown, index: number): BackupCategory => {
    const where = (message: string) => new ValidationError(`Category ${index + 1}: ${message}`)
    try {
      const c = requireObject(raw)
      // Same rules as creating a category through the app
      const settled = categoryAfterChange(null, {
        name: requireText(c.name, 'Name', 100),
        kind: requireOneOf(c.kind, 'Kind', CATEGORY_KINDS),
        budgetType: c.budgetType === undefined ? undefined : requireOneOf(c.budgetType, 'Budget type', BUDGET_TYPES),
        budgetCents: c.budgetCents === undefined ? undefined : nullable(c.budgetCents, (v) => requireBudgetCents(v, 'Budget amount')),
        budgetPercent: c.budgetPercent === undefined ? undefined : nullable(c.budgetPercent, (v) => requirePercent(v, 'Budget percent')),
        frequencyMonths: c.frequencyMonths === undefined ? undefined : requireFrequencyMonths(c.frequencyMonths, 'Frequency'),
        nextDueDate: c.nextDueDate === undefined ? undefined : nullable(c.nextDueDate, (v) => requireDate(v, 'Next due date')),
      })
      return { ...settled, createdOn: c.createdOn === undefined ? new Date().toISOString().slice(0, 10) : requireDate(c.createdOn, 'Created on') }
    } catch (error) {
      if (error instanceof ValidationError) throw where(error.message)
      throw error
    }
  })

  // Rules across categories
  const names = new Set<string>()
  for (const category of categories) {
    if (names.has(category.name)) throw new ValidationError(`Two categories are named "${category.name}"`)
    names.add(category.name)
  }
  if (categories.filter((c) => c.budgetType === 'REMAINDER').length > 1) throw new ValidationError(SECOND_REMAINDER)
  const percentHundredths = categories.reduce((sum, c) => sum + Math.round((c.budgetPercent ?? 0) * 100), 0)
  const percentError = percentTotalError(percentHundredths)
  if (percentError) throw new ValidationError(percentError)

  if (!Array.isArray(body.transactions)) throw new ValidationError('The backup has no transactions list')
  if (body.transactions.length > MAX_TRANSACTIONS) throw new ValidationError(`A backup can have at most ${MAX_TRANSACTIONS} transactions`)
  const transactions = body.transactions.map((raw: unknown, index: number): BackupTransaction => {
    try {
      const t = requireObject(raw)
      const category = nullable(t.category ?? null, (v) => requireText(v, 'Category', 100))
      if (category !== null && !names.has(category)) throw new ValidationError(`no category named "${category}" in the backup`)
      return {
        date: requireDate(t.date, 'Date'),
        description: requireText(t.description, 'Description', 200),
        amountCents: requireCents(t.amountCents, 'Amount'),
        category,
      }
    } catch (error) {
      if (error instanceof ValidationError) throw new ValidationError(`Transaction ${index + 1}: ${error.message}`)
      throw error
    }
  })

  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: String(body.exportedAt ?? ''), monthlyIncomeCents, categories, transactions }
}

export type RestoreResult = { categories: number; transactions: number }

// Reads and replaces a user's whole account
export type BackupStore = {
  export(userId: string): Promise<Backup>
  // Deletes the user's categories and transactions and loads the backup's, all or nothing.
  // The backup must have been checked with parseBackup.
  restore(userId: string, backup: Backup): Promise<RestoreResult>
}

const day = (date: Date) => date.toISOString().slice(0, 10)
const toDay = (date: string) => new Date(`${date}T00:00:00Z`)

export function createBackupStore(db: Database): BackupStore {
  return {
    export: async (userId) => {
      const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { monthlyIncomeCents: true } })
      const categories = await db.category.findMany({ where: { userId }, orderBy: { name: 'asc' } })
      const transactions = await db.transaction.findMany({
        where: { userId },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
        select: { date: true, description: true, amountCents: true, category: { select: { name: true } } },
      })
      return {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        monthlyIncomeCents: user.monthlyIncomeCents,
        categories: categories.map((c) => ({
          name: c.name,
          kind: c.kind,
          budgetType: c.budgetType,
          budgetCents: c.budgetCents,
          budgetPercent: c.budgetPercentHundredths === null ? null : c.budgetPercentHundredths / 100,
          frequencyMonths: c.frequencyMonths,
          nextDueDate: c.nextDueDate ? day(c.nextDueDate) : null,
          createdOn: day(c.createdAt),
        })),
        transactions: transactions.map((t) => ({
          date: day(t.date),
          description: t.description,
          amountCents: t.amountCents,
          category: t.category?.name ?? null,
        })),
      }
    },

    restore: async (userId, backup) =>
      // One database transaction: if anything fails, the user's old data is untouched
      db.$transaction(async (tx) => {
        await tx.transaction.deleteMany({ where: { userId } })
        await tx.category.deleteMany({ where: { userId } })
        await tx.user.update({ where: { id: userId }, data: { monthlyIncomeCents: backup.monthlyIncomeCents } })

        const idByName = new Map<string, string>()
        for (const c of backup.categories) {
          const created = await tx.category.create({
            data: {
              userId,
              name: c.name,
              kind: c.kind,
              budgetType: c.budgetType,
              budgetCents: c.budgetCents,
              budgetPercentHundredths: c.budgetPercent === null ? null : Math.round(c.budgetPercent * 100),
              frequencyMonths: c.frequencyMonths,
              nextDueDate: c.nextDueDate ? toDay(c.nextDueDate) : null,
              createdAt: toDay(c.createdOn),
            },
            select: { id: true },
          })
          idByName.set(c.name, created.id)
        }

        await tx.transaction.createMany({
          data: backup.transactions.map((t) => ({
            userId,
            date: toDay(t.date),
            description: t.description,
            amountCents: t.amountCents,
            categoryId: t.category === null ? null : idByName.get(t.category)!,
          })),
        })
        return { categories: backup.categories.length, transactions: backup.transactions.length }
      }),
  }
}
