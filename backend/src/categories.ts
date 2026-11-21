import { randomUUID } from 'node:crypto'
import type { Database } from './db.ts'
import { ConflictError, ValidationError } from './errors.ts'
import { Prisma } from './generated/prisma/client.ts'

export const CATEGORY_KINDS = ['BILL', 'EXPENSE'] as const
export type CategoryKind = (typeof CATEGORY_KINDS)[number]

export const BUDGET_TYPES = ['FIXED', 'PERCENT_OF_INCOME', 'REMAINDER'] as const
export type BudgetType = (typeof BUDGET_TYPES)[number]

// How a category's monthly amount is decided, and for bills, how often they're due.
export type BudgetSettings = {
  budgetType: BudgetType
  // FIXED: the amount in whole cents. For a bill, the estimate for each time it's due.
  budgetCents: number | null
  // PERCENT_OF_INCOME: e.g. 12.5 for 12.5% of monthly income
  budgetPercent: number | null
  // Bills only: 1 = monthly, 6 = every 6 months
  frequencyMonths: number
  // Bills only: YYYY-MM-DD; required when a bill isn't monthly
  nextDueDate: string | null
}

export type Category = { id: string; name: string; kind: CategoryKind } & BudgetSettings

export type CategoryInput = { name: string; kind: CategoryKind } & Partial<BudgetSettings>
export type CategoryChanges = Partial<CategoryInput>

// Reads and writes a user's categories. Every method is scoped to one user, so a user can
// never see or change another user's categories.
//
// A category's budget can change from a month on, so past months keep the budget they had.
// `month` (YYYY-MM) says which month a read is for, or which month a change starts in.
export type CategoryStore = {
  // The categories in use in `month`, with that month's budgets. Without a month: every category
  // the user has ever had, with its latest budget (for naming old transactions).
  list(userId: string, month?: string): Promise<Category[]>
  // Adds a category from `month` on. Reusing the name of a category that was removed restarts it.
  // Throws ConflictError for a duplicate name or a second remainder category,
  // and ValidationError for budget settings that don't fit together
  create(userId: string, input: CategoryInput, month: string): Promise<Category>
  // A budget change applies from `month` on; the name, kind, and bill schedule change everywhere.
  // Returns null if the category isn't in use in `month` or belongs to another user; throws like create
  update(userId: string, id: string, changes: CategoryChanges, month: string): Promise<Category | null>
  // Removes the category from `month` on; earlier months keep it. One that started in `month` or
  // later is deleted completely (its transactions become uncategorized).
  // Returns false if the category isn't in use in `month` or belongs to another user
  delete(userId: string, id: string, month: string): Promise<boolean>
}

export const DUPLICATE_NAME = 'You already have a category with that name'
export const SECOND_REMAINDER = 'Only one category can be the remainder'

// Percent-of-income budgets can't add up to more than all of the income
export function percentTotalError(totalHundredths: number): string | null {
  if (totalHundredths <= 10000) return null
  return `Percent budgets would total ${totalHundredths / 100}% of income. The most is 100%.`
}

export const DEFAULT_BUDGET_SETTINGS: BudgetSettings = {
  budgetType: 'FIXED',
  budgetCents: null,
  budgetPercent: null,
  frequencyMonths: 1,
  nextDueDate: null,
}

// Works out a category's budget settings after a change, and checks that they fit together:
// - Bills always use a fixed estimate, and need a due date when they aren't monthly.
// - Expenses are monthly, and use a fixed amount, a percent of income, or the remainder.
// A setting the change makes irrelevant (e.g. the old percent after switching to FIXED) is cleared;
// a setting the change sends that doesn't fit is an error.
export function resolveBudgetSettings(
  kind: CategoryKind,
  current: BudgetSettings,
  changes: Partial<BudgetSettings>,
): BudgetSettings {
  const sent = (field: keyof BudgetSettings) => changes[field] !== undefined
  const settings: BudgetSettings = { ...current, ...stripUndefined(changes) }

  if (kind === 'BILL') {
    if (!sent('budgetType')) settings.budgetType = 'FIXED'
    if (settings.budgetType !== 'FIXED') throw new ValidationError('Bills use a fixed estimate')
  } else {
    if (!sent('frequencyMonths')) settings.frequencyMonths = 1
    if (!sent('nextDueDate')) settings.nextDueDate = null
    if (settings.frequencyMonths !== 1 || settings.nextDueDate !== null) {
      throw new ValidationError('Only bills can have a frequency or due date')
    }
  }

  // Clear what doesn't apply to the budget type, unless it was sent (then it's an error below)
  if (settings.budgetType !== 'FIXED' && !sent('budgetCents')) settings.budgetCents = null
  if (settings.budgetType !== 'PERCENT_OF_INCOME' && !sent('budgetPercent')) settings.budgetPercent = null

  if (settings.budgetType === 'FIXED' && settings.budgetPercent !== null) {
    throw new ValidationError('A fixed budget has an amount, not a percent')
  }
  if (settings.budgetType === 'PERCENT_OF_INCOME') {
    if (settings.budgetPercent === null) throw new ValidationError('Enter a percent of income')
    if (settings.budgetCents !== null) throw new ValidationError('A percent budget has a percent, not an amount')
  }
  if (settings.budgetType === 'REMAINDER' && (settings.budgetCents !== null || settings.budgetPercent !== null)) {
    throw new ValidationError("The remainder category gets what's left, so it has no amount or percent")
  }
  if (kind === 'BILL' && settings.frequencyMonths > 1 && settings.nextDueDate === null) {
    throw new ValidationError("Enter when a bill that isn't monthly is next due")
  }

  return settings
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>
}

function budgetSettingsOf(category: Category): BudgetSettings {
  const { budgetType, budgetCents, budgetPercent, frequencyMonths, nextDueDate } = category
  return { budgetType, budgetCents, budgetPercent, frequencyMonths, nextDueDate }
}

function budgetChangesOf(changes: CategoryChanges): Partial<BudgetSettings> {
  const { budgetType, budgetCents, budgetPercent, frequencyMonths, nextDueDate } = changes
  return { budgetType, budgetCents, budgetPercent, frequencyMonths, nextDueDate }
}

// Shared by the real store and the test store: the category a create or update would produce.
export function categoryAfterChange(existing: Category | null, changes: CategoryChanges): Omit<Category, 'id'> {
  const name = changes.name ?? existing?.name
  const kind = changes.kind ?? existing?.kind
  if (name === undefined || kind === undefined) throw new ValidationError('Name and kind are required')
  const current = existing ? budgetSettingsOf(existing) : DEFAULT_BUDGET_SETTINGS
  return { name, kind, ...resolveBudgetSettings(kind, current, budgetChangesOf(changes)) }
}

// ---- Budget history ----

// A category's budget from `month` on. `stopped` means the category was removed from that month on.
export type BudgetVersion = { month: string; stopped: boolean } & Pick<BudgetSettings, 'budgetType' | 'budgetCents' | 'budgetPercent'>

// A category with every budget it has had, oldest first. It starts in its first version's month.
export type CategoryRecord = Pick<Category, 'id' | 'name' | 'kind' | 'frequencyMonths' | 'nextDueDate'> & {
  budgets: BudgetVersion[]
}

const toCategoryWith = (record: CategoryRecord, version: BudgetVersion): Category => ({
  id: record.id,
  name: record.name,
  kind: record.kind,
  budgetType: version.budgetType,
  budgetCents: version.budgetCents,
  budgetPercent: version.budgetPercent,
  frequencyMonths: record.frequencyMonths,
  nextDueDate: record.nextDueDate,
})

// The category as it was in `month`, or null if it hadn't started or had been removed by then
export function categoryInMonth(record: CategoryRecord, month: string): Category | null {
  const version = record.budgets.filter((b) => b.month <= month).at(-1)
  return version && !version.stopped ? toCategoryWith(record, version) : null
}

// The category with the last budget it had (even if it has since been removed)
export function latestCategory(record: CategoryRecord): Category | null {
  const version = record.budgets.filter((b) => !b.stopped).at(-1)
  return version ? toCategoryWith(record, version) : null
}

// The month a category starts in; bills that aren't monthly start saving here
export const startMonthOf = (record: CategoryRecord) => record.budgets[0]?.month ?? null

const byName = (a: Category, b: Category) => a.name.localeCompare(b.name)

export function categoriesInMonth(records: CategoryRecord[], month?: string): Category[] {
  return records
    .map((r) => (month ? categoryInMonth(r, month) : latestCategory(r)))
    .filter((c): c is Category => c !== null)
    .sort(byName)
}

// One remainder, and percent budgets of at most 100%, among the categories in use in `month`
function checkPlan(records: CategoryRecord[], month: string, category: Omit<Category, 'id'>, exceptId?: string) {
  const others = categoriesInMonth(records, month).filter((c) => c.id !== exceptId)
  if (category.budgetType === 'REMAINDER' && others.some((c) => c.budgetType === 'REMAINDER')) {
    throw new ConflictError(SECOND_REMAINDER)
  }
  if (category.budgetType === 'PERCENT_OF_INCOME' && category.budgetPercent !== null) {
    const total = others.reduce((sum, c) => sum + Math.round((c.budgetPercent ?? 0) * 100), 0) + Math.round(category.budgetPercent * 100)
    const error = percentTotalError(total)
    if (error) throw new ConflictError(error)
  }
}

const versionOf = (category: Omit<Category, 'id'>, month: string): BudgetVersion => ({
  month,
  stopped: false,
  budgetType: category.budgetType,
  budgetCents: category.budgetCents,
  budgetPercent: category.budgetPercent,
})

// Sets the budget from `month` on: replaces any change in `month` and drops later ones, since
// a change starting now should hold for every month after it
const withVersionFrom = (budgets: BudgetVersion[], version: BudgetVersion) => [
  ...budgets.filter((b) => b.month < version.month),
  version,
]

const sameBudget = (a: Pick<BudgetSettings, 'budgetType' | 'budgetCents' | 'budgetPercent'>, b: typeof a) =>
  a.budgetType === b.budgetType && a.budgetCents === b.budgetCents && a.budgetPercent === b.budgetPercent

// What a change does to a user's categories, worked out without touching the database so the
// real store and the test store behave the same. Each returns the category's new record.

export function recordAfterCreate(records: CategoryRecord[], input: CategoryInput, month: string, newId: string): CategoryRecord {
  const category = categoryAfterChange(null, input)
  const sameName = records.find((r) => r.name === category.name)
  if (sameName && categoryInMonth(sameName, month)) throw new ConflictError(DUPLICATE_NAME)
  checkPlan(records, month, category, sameName?.id)
  const { name, kind, frequencyMonths, nextDueDate } = category
  return {
    id: sameName?.id ?? newId,
    name,
    kind,
    frequencyMonths,
    nextDueDate,
    budgets: withVersionFrom(sameName?.budgets ?? [], versionOf(category, month)),
  }
}

export function recordAfterUpdate(records: CategoryRecord[], id: string, changes: CategoryChanges, month: string): CategoryRecord | null {
  const record = records.find((r) => r.id === id)
  const current = record && categoryInMonth(record, month)
  if (!record || !current) return null
  const category = categoryAfterChange(current, changes)
  if (records.some((r) => r.id !== id && r.name === category.name)) throw new ConflictError(DUPLICATE_NAME)
  checkPlan(records, month, category, id)
  const { name, kind, frequencyMonths, nextDueDate } = category
  return {
    id,
    name,
    kind,
    frequencyMonths,
    nextDueDate,
    budgets: sameBudget(current, category) ? record.budgets : withVersionFrom(record.budgets, versionOf(category, month)),
  }
}

// null if there's nothing to remove; 'delete' if the category hadn't started before `month`
export function recordAfterDelete(records: CategoryRecord[], id: string, month: string): CategoryRecord | 'delete' | null {
  const record = records.find((r) => r.id === id)
  if (!record || !categoryInMonth(record, month)) return null
  const earlier = record.budgets.filter((b) => b.month < month)
  if (earlier.length === 0) return 'delete'
  const stopped: BudgetVersion = { month, stopped: true, budgetType: 'FIXED', budgetCents: null, budgetPercent: null }
  return { ...record, budgets: [...earlier, stopped] }
}

// ---- Database ----

// The database stores percents as hundredths (12.5% → 1250) and dates as Date objects.
const recordSelect = {
  id: true,
  name: true,
  kind: true,
  frequencyMonths: true,
  nextDueDate: true,
  budgets: {
    orderBy: { month: 'asc' },
    select: { month: true, stopped: true, budgetType: true, budgetCents: true, budgetPercentHundredths: true },
  },
} as const

type RecordRow = Prisma.CategoryGetPayload<{ select: typeof recordSelect }>

export const toRecord = (row: RecordRow): CategoryRecord => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  frequencyMonths: row.frequencyMonths,
  nextDueDate: row.nextDueDate ? row.nextDueDate.toISOString().slice(0, 10) : null,
  budgets: row.budgets.map(({ budgetPercentHundredths, ...b }) => ({
    ...b,
    budgetPercent: budgetPercentHundredths === null ? null : budgetPercentHundredths / 100,
  })),
})

export const budgetRowData = ({ budgetPercent, ...b }: BudgetVersion) => ({
  ...b,
  budgetPercentHundredths: budgetPercent === null ? null : Math.round(budgetPercent * 100),
})

const toDay = (date: string | null) => (date ? new Date(`${date}T00:00:00Z`) : null)

function isDuplicateName(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

export async function loadCategoryRecords(db: Database, userId: string): Promise<CategoryRecord[]> {
  const rows = await db.category.findMany({ where: { userId }, select: recordSelect, orderBy: { name: 'asc' } })
  return rows.map(toRecord)
}

export function createCategoryStore(db: Database): CategoryStore {
  // Saves a record: the category's own fields, and its budget history replaced as a whole
  const save = async (userId: string, record: CategoryRecord, isNew: boolean) => {
    const fields = { name: record.name, kind: record.kind, frequencyMonths: record.frequencyMonths, nextDueDate: toDay(record.nextDueDate) }
    try {
      await db.$transaction(async (tx) => {
        if (isNew) {
          await tx.category.create({ data: { id: record.id, userId, ...fields } })
        } else {
          await tx.category.update({ where: { id: record.id }, data: fields })
          await tx.categoryBudget.deleteMany({ where: { categoryId: record.id } })
        }
        await tx.categoryBudget.createMany({ data: record.budgets.map((b) => ({ categoryId: record.id, ...budgetRowData(b) })) })
      })
    } catch (error) {
      if (isDuplicateName(error)) throw new ConflictError(DUPLICATE_NAME)
      throw error
    }
  }

  return {
    list: async (userId, month) => categoriesInMonth(await loadCategoryRecords(db, userId), month),

    create: async (userId, input, month) => {
      const records = await loadCategoryRecords(db, userId)
      const record = recordAfterCreate(records, input, month, randomUUID())
      await save(userId, record, !records.some((r) => r.id === record.id))
      return categoryInMonth(record, month)!
    },

    update: async (userId, id, changes, month) => {
      const record = recordAfterUpdate(await loadCategoryRecords(db, userId), id, changes, month)
      if (!record) return null
      await save(userId, record, false)
      return categoryInMonth(record, month)
    },

    delete: async (userId, id, month) => {
      const result = recordAfterDelete(await loadCategoryRecords(db, userId), id, month)
      if (result === null) return false
      // Deleting completely leaves the category's transactions in place, uncategorized
      if (result === 'delete') await db.category.delete({ where: { id } })
      else await save(userId, result, false)
      return true
    },
  }
}
