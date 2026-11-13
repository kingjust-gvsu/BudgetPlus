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
import { CATEGORY_NOT_FOUND, type Transaction, type TransactionStore } from '../transactions.ts'
import type { UserStore } from '../users.ts'

// Test stand-ins for the database and Firebase, so tests run without either.

export const VALID_TOKEN = 'valid-token'
export const OTHER_USER_TOKEN = 'other-user-token'

export const testUser: AuthenticatedUser = {
  id: '00000000-0000-0000-0000-000000000001',
  firebaseUid: 'firebase-uid-1',
  email: 'test@example.com',
  monthlyIncomeCents: null,
}

export const otherUser: AuthenticatedUser = {
  id: '00000000-0000-0000-0000-000000000002',
  firebaseUid: 'firebase-uid-2',
  email: 'other@example.com',
  monthlyIncomeCents: null,
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

// Keeps each user's income in memory.
export function createFakeUserStore(users: AuthenticatedUser[] = [testUser, otherUser]): UserStore {
  return {
    setMonthlyIncome: async (userId, monthlyIncomeCents) => {
      const user = users.find((u) => u.id === userId)
      if (!user) throw new Error('unknown user')
      return { ...user, monthlyIncomeCents }
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
    listByMonth: async (userId, month) =>
      rows
        .filter((r) => r.userId === userId && r.date.startsWith(`${month}-`))
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
    users: createFakeUserStore(),
    summary: { load: async () => ({ categories: [], transactions: [], fundPayments: new Map() }) },
    ...overrides,
  }
}
