import { randomUUID } from 'node:crypto'
import type { AppDependencies } from '../app.ts'
import type { AuthenticatedUser } from '../auth.ts'
import { DUPLICATE_NAME, type Category, type CategoryStore } from '../categories.ts'
import { ConflictError, ValidationError } from '../errors.ts'
import { CATEGORY_NOT_FOUND, type Transaction, type TransactionStore } from '../transactions.ts'

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

// Behaves like the real category store, but keeps everything in memory.
export function createFakeCategoryStore(rows: StoredCategory[] = []): CategoryStore & { rows: StoredCategory[] } {
  const toCategory = ({ id, name, kind }: StoredCategory): Category => ({ id, name, kind })
  const nameTaken = (userId: string, name: string, exceptId?: string) =>
    rows.some((r) => r.userId === userId && r.name === name && r.id !== exceptId)

  return {
    rows,
    list: async (userId) =>
      rows
        .filter((r) => r.userId === userId)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(toCategory),
    create: async (userId, input) => {
      if (nameTaken(userId, input.name)) throw new ConflictError(DUPLICATE_NAME)
      const row = { id: randomUUID(), userId, ...input }
      rows.push(row)
      return toCategory(row)
    },
    update: async (userId, id, changes) => {
      const row = rows.find((r) => r.id === id && r.userId === userId)
      if (!row) return null
      if (changes.name && nameTaken(userId, changes.name, id)) throw new ConflictError(DUPLICATE_NAME)
      Object.assign(row, changes)
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

type StoredTransaction = Transaction & { userId: string }

// Behaves like the real transaction store, but keeps everything in memory. `categories` is the
// category list it checks ownership against (share it with a fake category store).
export function createFakeTransactionStore(
  rows: StoredTransaction[] = [],
  categories: StoredCategory[] = [],
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
    ...overrides,
  }
}
