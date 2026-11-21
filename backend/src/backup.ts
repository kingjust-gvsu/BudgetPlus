import { ACCOUNT_TYPES, DEFAULT_ACCOUNT_NAME, type AccountInput } from './accounts.ts'
import {
  BUDGET_TYPES,
  budgetRowData,
  CATEGORY_KINDS,
  categoriesInMonth,
  categoryAfterChange,
  percentTotalError,
  SECOND_REMAINDER,
  toRecord,
  type BudgetVersion,
  type Category,
} from './categories.ts'
import type { Database } from './db.ts'
import { ValidationError } from './errors.ts'
import {
  nullable,
  requireBalanceCents,
  requireBudgetCents,
  requireCents,
  requireDate,
  requireFrequencyMonths,
  requireMonth,
  requireObject,
  requireOneOf,
  requirePercent,
  requireText,
} from './validation.ts'

// A user's whole budget in one file: income by month, accounts, categories with their budgets, and
// transactions. Transactions name their category and account rather than using database ids, so a
// backup can be restored into any user. Restoring replaces everything the user had.

export const BACKUP_FORMAT = 'budget-plus-backup'
// Version 4 added accounts; version 3, each category's budget history; version 2, income by month.
// Older files can still be restored: their transactions go in a "Checking" account, and their one
// budget per category starts in the month the category was added.
export const BACKUP_VERSION = 4
const MAX_ACCOUNTS = 200
const MAX_INCOME_ROWS = 2000
const MAX_CATEGORIES = 500
const MAX_TRANSACTIONS = 20000

export type BackupCategory = Pick<Category, 'name' | 'kind' | 'frequencyMonths' | 'nextDueDate'> & {
  // When the category was added
  createdOn: string
  // Every budget it has had, oldest first, each from its month on; the first is when it starts
  budgets: BudgetVersion[]
}

export type BackupTransaction = {
  date: string
  description: string
  amountCents: number
  category: string | null // the category's name
  account: string // the account's name
}

export type BackupAccount = AccountInput

// Income sources with every amount they've had (each from its month on), plus one-off other income
export type BackupIncome = {
  sources: { name: string; amounts: { month: string; amountCents: number }[] }[]
  other: { month: string; amountCents: number }[]
}

export type Backup = {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  exportedAt: string
  income: BackupIncome
  accounts: BackupAccount[]
  categories: BackupCategory[]
  transactions: BackupTransaction[]
}

// Checks a backup file from the user against every rule the app enforces, so restoring it can't
// produce data the app wouldn't allow. Throws ValidationError naming the first problem found.
export function parseBackup(raw: unknown): Backup {
  const body = requireObject(raw)
  if (body.format !== BACKUP_FORMAT) throw new ValidationError("This isn't a Budget+ backup file")
  if (![1, 2, 3, BACKUP_VERSION].includes(body.version as number)) {
    throw new ValidationError(`This backup is version ${String(body.version)}; only versions 1 to ${BACKUP_VERSION} can be restored`)
  }

  if (!Array.isArray(body.categories)) throw new ValidationError('The backup has no categories list')
  if (body.categories.length > MAX_CATEGORIES) throw new ValidationError(`A backup can have at most ${MAX_CATEGORIES} categories`)
  const categories = body.categories.map((raw: unknown, index: number): BackupCategory => {
    const where = (message: string) => new ValidationError(`Category ${index + 1}: ${message}`)
    try {
      const c = requireObject(raw)
      const name = requireText(c.name, 'Name', 100)
      const kind = requireOneOf(c.kind, 'Kind', CATEGORY_KINDS)
      const schedule = {
        frequencyMonths: c.frequencyMonths === undefined ? undefined : requireFrequencyMonths(c.frequencyMonths, 'Frequency'),
        nextDueDate: c.nextDueDate === undefined ? undefined : nullable(c.nextDueDate, (v) => requireDate(v, 'Next due date')),
      }
      const createdOn = c.createdOn === undefined ? null : requireDate(c.createdOn, 'Created on')
      // Same rules as setting a budget through the app
      const settle = (b: Record<string, unknown>) =>
        categoryAfterChange(null, {
          name,
          kind,
          ...schedule,
          budgetType: b.budgetType === undefined ? undefined : requireOneOf(b.budgetType, 'Budget type', BUDGET_TYPES),
          budgetCents: b.budgetCents === undefined ? undefined : nullable(b.budgetCents, (v) => requireBudgetCents(v, 'Budget amount')),
          budgetPercent: b.budgetPercent === undefined ? undefined : nullable(b.budgetPercent, (v) => requirePercent(v, 'Budget percent')),
        })

      let budgets: BudgetVersion[]
      let settled: Omit<Category, 'id'>
      if ((body.version as number) >= 3) {
        if (!Array.isArray(c.budgets) || c.budgets.length === 0) throw new ValidationError('No budgets list')
        settled = settle({})
        budgets = c.budgets.map((item: unknown): BudgetVersion => {
          const b = requireObject(item)
          const month = requireMonth(b.month, 'Budget month')
          if (b.stopped === true) return { month, stopped: true, budgetType: 'FIXED', budgetCents: null, budgetPercent: null }
          const { budgetType, budgetCents, budgetPercent } = settle(b)
          return { month, stopped: false, budgetType, budgetCents, budgetPercent }
        })
        for (let i = 1; i < budgets.length; i++) {
          if (budgets[i].month <= budgets[i - 1].month) throw new ValidationError('Budgets must be in month order, each month once')
        }
        if (budgets[0].stopped) throw new ValidationError("A category can't start out removed")
      } else {
        // Older backups have one budget, from the month the category was added
        settled = settle(c)
        const { budgetType, budgetCents, budgetPercent } = settled
        const month = (createdOn ?? new Date().toISOString().slice(0, 10)).slice(0, 7)
        budgets = [{ month, stopped: false, budgetType, budgetCents, budgetPercent }]
      }
      return {
        name,
        kind,
        frequencyMonths: settled.frequencyMonths,
        nextDueDate: settled.nextDueDate,
        createdOn: createdOn ?? `${budgets[0].month}-01`,
        budgets,
      }
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
  // In every month a budget changes: one remainder, and percent budgets of at most 100%
  const records = categories.map((c, i) => ({ ...c, id: String(i) }))
  const changeMonths = [...new Set(categories.flatMap((c) => c.budgets.map((b) => b.month)))].sort()
  for (const month of changeMonths) {
    const plan = categoriesInMonth(records, month)
    if (plan.filter((c) => c.budgetType === 'REMAINDER').length > 1) throw new ValidationError(`${month}: ${SECOND_REMAINDER}`)
    const percentError = percentTotalError(plan.reduce((sum, c) => sum + Math.round((c.budgetPercent ?? 0) * 100), 0))
    if (percentError) throw new ValidationError(`${month}: ${percentError}`)
  }

  const hasAccounts = (body.version as number) >= 4
  const accounts = hasAccounts ? parseAccounts(body.accounts) : []
  const accountNames = new Set(accounts.map((a) => a.name))

  if (!Array.isArray(body.transactions)) throw new ValidationError('The backup has no transactions list')
  if (body.transactions.length > MAX_TRANSACTIONS) throw new ValidationError(`A backup can have at most ${MAX_TRANSACTIONS} transactions`)
  const transactions = body.transactions.map((raw: unknown, index: number): BackupTransaction => {
    try {
      const t = requireObject(raw)
      const category = nullable(t.category ?? null, (v) => requireText(v, 'Category', 100))
      if (category !== null && !names.has(category)) throw new ValidationError(`no category named "${category}" in the backup`)
      // Older backups have no accounts; their transactions all go in one bank account
      const account = hasAccounts ? requireText(t.account, 'Account', 100) : DEFAULT_ACCOUNT_NAME
      if (hasAccounts && !accountNames.has(account)) throw new ValidationError(`no account named "${account}" in the backup`)
      return {
        date: requireDate(t.date, 'Date'),
        description: requireText(t.description, 'Description', 200),
        amountCents: requireCents(t.amountCents, 'Amount'),
        category,
        account,
      }
    } catch (error) {
      if (error instanceof ValidationError) throw new ValidationError(`Transaction ${index + 1}: ${error.message}`)
      throw error
    }
  })

  const income =
    body.version === 1
      ? incomeFromVersion1(body.monthlyIncomeCents, categories, transactions)
      : parseIncome(body.income)

  if (!hasAccounts && transactions.length > 0) {
    // Starting at $0 on the first transaction's day
    const startDate = transactions.map((t) => t.date).sort()[0]
    accounts.push({ name: DEFAULT_ACCOUNT_NAME, type: 'BANK', startingBalanceCents: 0, startDate })
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: String(body.exportedAt ?? ''),
    income,
    accounts,
    categories,
    transactions,
  }
}

function parseAccounts(raw: unknown): BackupAccount[] {
  if (!Array.isArray(raw)) throw new ValidationError('The backup has no accounts list')
  if (raw.length > MAX_ACCOUNTS) throw new ValidationError(`A backup can have at most ${MAX_ACCOUNTS} accounts`)
  const names = new Set<string>()
  return raw.map((item: unknown, index: number) => {
    try {
      const a = requireObject(item)
      const name = requireText(a.name, 'Name', 100)
      if (names.has(name)) throw new ValidationError(`two accounts are named "${name}"`)
      names.add(name)
      return {
        name,
        type: requireOneOf(a.type, 'Type', ACCOUNT_TYPES),
        startingBalanceCents: requireBalanceCents(a.startingBalanceCents, 'Starting balance'),
        startDate: requireDate(a.startDate, 'Start date'),
      }
    } catch (error) {
      if (error instanceof ValidationError) throw new ValidationError(`Account ${index + 1}: ${error.message}`)
      throw error
    }
  })
}

// A list of { month, amountCents } with each month at most once
function parseMonthAmounts(raw: unknown, what: string): { month: string; amountCents: number }[] {
  if (!Array.isArray(raw)) throw new ValidationError(`${what} has no list of amounts`)
  if (raw.length > MAX_INCOME_ROWS) throw new ValidationError(`${what} has too many amounts`)
  const seen = new Set<string>()
  const amounts = raw.map((item: unknown) => {
    const a = requireObject(item)
    const month = requireMonth(a.month, `${what} month`)
    if (seen.has(month)) throw new ValidationError(`${what} has ${month} twice`)
    seen.add(month)
    return { month, amountCents: requireBudgetCents(a.amountCents, `${what} amount`) }
  })
  return amounts.sort((a, b) => a.month.localeCompare(b.month))
}

function parseIncome(raw: unknown): BackupIncome {
  const income = requireObject(raw ?? {})
  const rawSources = income.sources ?? []
  if (!Array.isArray(rawSources)) throw new ValidationError('The backup has no income sources list')
  const names = new Set<string>()
  const sources = rawSources.map((item: unknown, index: number) => {
    const source = requireObject(item)
    const name = requireText(source.name, `Income source ${index + 1} name`, 100)
    if (names.has(name)) throw new ValidationError(`Two income sources are named "${name}"`)
    names.add(name)
    return { name, amounts: parseMonthAmounts(source.amounts, `Income source "${name}"`) }
  })
  const other = parseMonthAmounts(income.other ?? [], 'Other income').filter((o) => o.amountCents > 0)
  return { sources, other }
}

// A version 1 backup has one monthly income; it becomes a source called "Income" that starts in
// the earliest month the backup has data for, so every month in it has that income.
function incomeFromVersion1(raw: unknown, categories: BackupCategory[], transactions: BackupTransaction[]): BackupIncome {
  const amountCents = nullable(raw ?? null, (v) => requireBudgetCents(v, 'Monthly income'))
  if (amountCents === null) return { sources: [], other: [] }
  const dates = [...categories.map((c) => c.createdOn), ...transactions.map((t) => t.date), new Date().toISOString().slice(0, 10)]
  const month = dates.sort()[0].slice(0, 7)
  return { sources: [{ name: 'Income', amounts: [{ month, amountCents }] }], other: [] }
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
      const sources = await db.incomeSource.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: { name: true, amounts: { orderBy: { month: 'asc' }, select: { month: true, amountCents: true } } },
      })
      const other = await db.otherIncome.findMany({ where: { userId }, orderBy: { month: 'asc' }, select: { month: true, amountCents: true } })
      const accounts = await db.account.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: { name: true, type: true, startingBalanceCents: true, startDate: true },
      })
      const categories = await db.category.findMany({
        where: { userId },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          kind: true,
          frequencyMonths: true,
          nextDueDate: true,
          createdAt: true,
          budgets: {
            orderBy: { month: 'asc' },
            select: { month: true, stopped: true, budgetType: true, budgetCents: true, budgetPercentHundredths: true },
          },
        },
      })
      const transactions = await db.transaction.findMany({
        where: { userId },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
        select: { date: true, description: true, amountCents: true, category: { select: { name: true } }, account: { select: { name: true } } },
      })
      return {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        income: { sources, other },
        accounts: accounts.map((a) => ({ ...a, startDate: day(a.startDate) })),
        categories: categories.map((c) => {
          const record = toRecord(c)
          return {
            name: record.name,
            kind: record.kind,
            frequencyMonths: record.frequencyMonths,
            nextDueDate: record.nextDueDate,
            createdOn: day(c.createdAt),
            budgets: record.budgets,
          }
        }),
        transactions: transactions.map((t) => ({
          date: day(t.date),
          description: t.description,
          amountCents: t.amountCents,
          category: t.category?.name ?? null,
          account: t.account.name,
        })),
      }
    },

    restore: async (userId, backup) =>
      // One database transaction: if anything fails, the user's old data is untouched
      db.$transaction(async (tx) => {
        await tx.transaction.deleteMany({ where: { userId } })
        await tx.account.deleteMany({ where: { userId } })
        await tx.category.deleteMany({ where: { userId } })
        await tx.incomeSource.deleteMany({ where: { userId } })
        await tx.otherIncome.deleteMany({ where: { userId } })
        for (const source of backup.income.sources) {
          await tx.incomeSource.create({ data: { userId, name: source.name, amounts: { create: source.amounts } } })
        }
        await tx.otherIncome.createMany({ data: backup.income.other.map((o) => ({ userId, ...o })) })

        const accountIdByName = new Map<string, string>()
        for (const a of backup.accounts) {
          const created = await tx.account.create({ data: { userId, ...a, startDate: toDay(a.startDate) }, select: { id: true } })
          accountIdByName.set(a.name, created.id)
        }

        const idByName = new Map<string, string>()
        for (const c of backup.categories) {
          const created = await tx.category.create({
            data: {
              userId,
              name: c.name,
              kind: c.kind,
              frequencyMonths: c.frequencyMonths,
              nextDueDate: c.nextDueDate ? toDay(c.nextDueDate) : null,
              createdAt: toDay(c.createdOn),
              budgets: { create: c.budgets.map(budgetRowData) },
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
            accountId: accountIdByName.get(t.account)!,
          })),
        })
        return { categories: backup.categories.length, transactions: backup.transactions.length }
      }),
  }
}
