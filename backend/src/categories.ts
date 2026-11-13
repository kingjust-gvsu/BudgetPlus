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
export type CategoryStore = {
  list(userId: string): Promise<Category[]>
  // Throws ConflictError for a duplicate name or a second remainder category,
  // and ValidationError for budget settings that don't fit together
  create(userId: string, input: CategoryInput): Promise<Category>
  // Returns null if the category doesn't exist or belongs to another user; throws like create
  update(userId: string, id: string, changes: CategoryChanges): Promise<Category | null>
  // Returns false if the category doesn't exist or belongs to another user
  delete(userId: string, id: string): Promise<boolean>
}

export const DUPLICATE_NAME = 'You already have a category with that name'
export const SECOND_REMAINDER = 'Only one category can be the remainder'

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

// The database stores percents as hundredths (12.5% → 1250) and dates as Date objects.
const fields = {
  id: true,
  name: true,
  kind: true,
  budgetType: true,
  budgetCents: true,
  budgetPercentHundredths: true,
  frequencyMonths: true,
  nextDueDate: true,
} as const

type Row = Prisma.CategoryGetPayload<{ select: typeof fields }>

const toCategory = ({ budgetPercentHundredths, nextDueDate, ...row }: Row): Category => ({
  ...row,
  budgetPercent: budgetPercentHundredths === null ? null : budgetPercentHundredths / 100,
  nextDueDate: nextDueDate ? nextDueDate.toISOString().slice(0, 10) : null,
})

const toRowData = ({ budgetPercent, nextDueDate, ...rest }: Omit<Category, 'id'>) => ({
  ...rest,
  budgetPercentHundredths: budgetPercent === null ? null : Math.round(budgetPercent * 100),
  nextDueDate: nextDueDate ? new Date(`${nextDueDate}T00:00:00Z`) : null,
})

function isDuplicateName(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

export function createCategoryStore(db: Database): CategoryStore {
  const checkOneRemainder = async (userId: string, category: Omit<Category, 'id'>, exceptId?: string) => {
    if (category.budgetType !== 'REMAINDER') return
    const other = await db.category.findFirst({
      where: { userId, budgetType: 'REMAINDER', ...(exceptId ? { id: { not: exceptId } } : {}) },
    })
    if (other) throw new ConflictError(SECOND_REMAINDER)
  }

  const findOwn = async (userId: string, id: string) => {
    const row = await db.category.findFirst({ where: { id, userId }, select: fields })
    return row ? toCategory(row) : null
  }

  return {
    list: async (userId) => {
      const rows = await db.category.findMany({ where: { userId }, select: fields, orderBy: { name: 'asc' } })
      return rows.map(toCategory)
    },

    create: async (userId, input) => {
      const category = categoryAfterChange(null, input)
      await checkOneRemainder(userId, category)
      try {
        return toCategory(await db.category.create({ data: { userId, ...toRowData(category) }, select: fields }))
      } catch (error) {
        if (isDuplicateName(error)) throw new ConflictError(DUPLICATE_NAME)
        throw error
      }
    },

    update: async (userId, id, changes) => {
      const existing = await findOwn(userId, id)
      if (!existing) return null
      const category = categoryAfterChange(existing, changes)
      await checkOneRemainder(userId, category, id)
      try {
        return toCategory(await db.category.update({ where: { id }, data: toRowData(category), select: fields }))
      } catch (error) {
        if (isDuplicateName(error)) throw new ConflictError(DUPLICATE_NAME)
        throw error
      }
    },

    // The database leaves the category's transactions in place, uncategorized
    delete: async (userId, id) => {
      const { count } = await db.category.deleteMany({ where: { id, userId } })
      return count > 0
    },
  }
}
