import { randomUUID } from 'node:crypto'
import type { AppDependencies } from '../app.ts'
import type { AuthenticatedUser } from '../auth.ts'
import {
  categoryAfterChange,
  DEFAULT_BUDGET_SETTINGS,
  DUPLICATE_NAME,
  percentTotalError,
  SECOND_REMAINDER,
  type BudgetSettings,
  type Category,
  type CategoryStore,
} from '../categories.ts'
import { ConflictError, ValidationError } from '../errors.ts'
import { CATEGORY_NOT_FOUND, withoutDuplicates, type Transaction, type TransactionStore } from '../transactions.ts'
import { SOURCE_NAME_TAKEN, type IncomeData, type IncomeStore } from '../income.ts'

// Test stand-ins for the database and Firebase, so tests run without either.

export const VALID_TOKEN = 'valid-token'
export const OTHER_USER_TOKEN = 'other-user-token'

export const testUser: AuthenticatedUser = {
  id: '00000000-0000-0000-0000-000000000001',
  firebaseUid: 'firebase-uid-1',
  email: 'test@example.com',
}

export const otherUser: AuthenticatedUser = {
  id: '00000000-0000-0000-0000-000000000002',
  firebaseUid: 'firebase-uid-2',
  email: 'other@example.com',
}

const usersByToken: Record<string, AuthenticatedUser> = {
  [VALID_TOKEN]: testUser,
  [OTHER_USER_TOKEN]: otherUser,
}

type StoredCategory = Category & { userId: string }

// Tests can give just id, name, and kind; the budget settings default like a new category's.
type CategorySeed = Omit<StoredCategory, keyof BudgetSettings> & Partial<BudgetSettings>

// Behaves like the real category store, but keeps everything in memory.
export function createFakeCategoryStore(seeds: CategorySeed[] = []): CategoryStore & { rows: StoredCategory[] } {
  // Fill in defaults on the same objects, so other fakes sharing this list see the changes
  for (const seed of seeds) {
    for (const [key, value] of Object.entries(DEFAULT_BUDGET_SETTINGS)) {
      const field = key as keyof BudgetSettings
      if (seed[field] === undefined) Object.assign(seed, { [field]: value })
    }
  }
  const rows = seeds as StoredCategory[]

  const toCategory = ({ userId: _userId, ...category }: StoredCategory): Category => category
  const nameTaken = (userId: string, name: string, exceptId?: string) =>
    rows.some((r) => r.userId === userId && r.name === name && r.id !== exceptId)
  const checkOneRemainder = (userId: string, category: Omit<Category, 'id'>, exceptId?: string) => {
    const other = rows.some((r) => r.userId === userId && r.budgetType === 'REMAINDER' && r.id !== exceptId)
    if (category.budgetType === 'REMAINDER' && other) throw new ConflictError(SECOND_REMAINDER)
  }
  const checkPercentTotal = (userId: string, category: Omit<Category, 'id'>, exceptId?: string) => {
    if (category.budgetType !== 'PERCENT_OF_INCOME' || category.budgetPercent === null) return
    const others = rows
      .filter((r) => r.userId === userId && r.budgetType === 'PERCENT_OF_INCOME' && r.id !== exceptId)
      .reduce((sum, r) => sum + Math.round((r.budgetPercent ?? 0) * 100), 0)
    const error = percentTotalError(others + Math.round(category.budgetPercent * 100))
    if (error) throw new ConflictError(error)
  }

  return {
    rows,
    list: async (userId) =>
      rows
        .filter((r) => r.userId === userId)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(toCategory),
    create: async (userId, input) => {
      const category = categoryAfterChange(null, input)
      checkOneRemainder(userId, category)
      checkPercentTotal(userId, category)
      if (nameTaken(userId, category.name)) throw new ConflictError(DUPLICATE_NAME)
      const row = { id: randomUUID(), userId, ...category }
      rows.push(row)
      return toCategory(row)
    },
    update: async (userId, id, changes) => {
      const row = rows.find((r) => r.id === id && r.userId === userId)
      if (!row) return null
      const category = categoryAfterChange(toCategory(row), changes)
      checkOneRemainder(userId, category, id)
      checkPercentTotal(userId, category, id)
      if (nameTaken(userId, category.name, id)) throw new ConflictError(DUPLICATE_NAME)
      Object.assign(row, category)
      return toCategory(row)
    },
    delete: async (userId, id) => {
      const index = rows.findIndex((r) => r.id === id && r.userId === userId)
      if (index === -1) return false
      rows.splice(index, 1)
      return true
    },
  }
}

// Keeps each user's income in memory, like the real income store.
export function createFakeIncomeStore(): IncomeStore & { data: Map<string, IncomeData> } {
  const data = new Map<string, IncomeData>()
  const of = (userId: string) => {
    if (!data.has(userId)) data.set(userId, { sources: [], other: new Map() })
    return data.get(userId)!
  }
  const find = (userId: string, id: string) => of(userId).sources.find((s) => s.id === id)

  return {
    data,
    load: async (userId) => of(userId),
    createSource: async (userId, name, month, amountCents) => {
      if (of(userId).sources.some((s) => s.name === name)) throw new ConflictError(SOURCE_NAME_TAKEN)
      of(userId).sources.push({ id: randomUUID(), name, amounts: [{ month, amountCents }] })
    },
    renameSource: async (userId, id, name) => {
      const source = find(userId, id)
      if (!source) return false
      if (of(userId).sources.some((s) => s.name === name && s.id !== id)) throw new ConflictError(SOURCE_NAME_TAKEN)
      source.name = name
      return true
    },
    stopSource: async (userId, id, month) => {
      const sources = of(userId).sources
      const source = sources.find((s) => s.id === id)
      if (!source) return false
      source.amounts = source.amounts.filter((a) => a.month < month)
      if (source.amounts.length === 0) sources.splice(sources.indexOf(source), 1)
      else source.amounts.push({ month, amountCents: 0 })
      return true
    },
    setAmount: async (userId, id, month, amountCents) => {
      const source = find(userId, id)
      if (!source) return false
      source.amounts = [...source.amounts.filter((a) => a.month !== month), { month, amountCents }].sort((x, y) =>
        x.month.localeCompare(y.month),
      )
      return true
    },
    setOther: async (userId, month, amountCents) => {
      if (amountCents === 0) of(userId).other.delete(month)
      else of(userId).other.set(month, amountCents)
    },
  }
}

type StoredTransaction = Transaction & { userId: string }

// Behaves like the real transaction store, but keeps everything in memory. `categories` is the
// category list it checks ownership against (share it with a fake category store).
export function createFakeTransactionStore(
  rows: StoredTransaction[] = [],
  categories: Pick<StoredCategory, 'id' | 'userId'>[] = [],
): TransactionStore & { rows: StoredTransaction[] } {
  const toTransaction = ({ id, date, description, amountCents, categoryId }: StoredTransaction): Transaction => ({
    id,
    date,
    description,
    amountCents,
    categoryId,
  })
  const checkCategory = (userId: string, categoryId: string | null | undefined) => {
    if (categoryId && !categories.some((c) => c.id === categoryId && c.userId === userId)) {
      throw new ValidationError(CATEGORY_NOT_FOUND)
    }
  }

  return {
    rows,
    list: async (userId, month) =>
      rows
        .filter((r) => r.userId === userId && (!month || r.date.startsWith(`${month}-`)))
        .sort((a, b) => b.date.localeCompare(a.date))
        .map(toTransaction),
    create: async (userId, input) => {
      checkCategory(userId, input.categoryId)
      const row = { id: randomUUID(), userId, ...input }
      rows.push(row)
      return toTransaction(row)
    },
    update: async (userId, id, changes) => {
      const row = rows.find((r) => r.id === id && r.userId === userId)
      if (!row) return null
      checkCategory(userId, changes.categoryId)
      Object.assign(row, changes)
      return toTransaction(row)
    },
    delete: async (userId, id) => {
      const index = rows.findIndex((r) => r.id === id && r.userId === userId)
      if (index === -1) return false
      rows.splice(index, 1)
      return true
    },
    importMany: async (userId, inputs) => {
      for (const input of inputs) checkCategory(userId, input.categoryId)
      const toAdd = withoutDuplicates(inputs, rows.filter((r) => r.userId === userId))
      for (const input of toAdd) rows.push({ id: randomUUID(), userId, ...input })
      return { imported: toAdd.length, duplicates: inputs.length - toAdd.length }
    },
  }
}

export function fakeDependencies(overrides: Partial<AppDependencies> = {}): AppDependencies {
  return {
    checkDatabase: async () => true,
    verifyToken: async (token) => {
      const user = usersByToken[token]
      if (!user) throw new Error('invalid token')
      return { uid: user.firebaseUid, email: user.email ?? undefined }
    },
    findOrCreateUser: async ({ uid }) => (uid === otherUser.firebaseUid ? otherUser : testUser),
    categories: createFakeCategoryStore(),
    transactions: createFakeTransactionStore(),
    income: createFakeIncomeStore(),
    summary: { load: async () => ({ categories: [], transactions: [], fundPayments: new Map() }) },
    backup: {
      export: async () => {
        throw new Error('backup not faked in this test')
      },
      restore: async (_userId, backup) => ({ categories: backup.categories.length, transactions: backup.transactions.length }),
    },
    ...overrides,
  }
}
