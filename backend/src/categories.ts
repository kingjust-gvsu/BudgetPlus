import type { Database } from './db.ts'
import { ConflictError } from './errors.ts'
import { Prisma } from './generated/prisma/client.ts'

export const CATEGORY_KINDS = ['BILL', 'EXPENSE'] as const
export type CategoryKind = (typeof CATEGORY_KINDS)[number]

export type Category = {
  id: string
  name: string
  kind: CategoryKind
}

export type CategoryChanges = {
  name?: string
  kind?: CategoryKind
}

// Reads and writes a user's categories. Every method is scoped to one user, so a user can
// never see or change another user's categories.
export type CategoryStore = {
  list(userId: string): Promise<Category[]>
  // Throws ConflictError if the user already has a category with that name
  create(userId: string, input: { name: string; kind: CategoryKind }): Promise<Category>
  // Returns null if the category doesn't exist or belongs to another user
  update(userId: string, id: string, changes: CategoryChanges): Promise<Category | null>
  // Returns false if the category doesn't exist or belongs to another user
  delete(userId: string, id: string): Promise<boolean>
}

export const DUPLICATE_NAME = 'You already have a category with that name'

const fields = { id: true, name: true, kind: true } as const

function isDuplicateName(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

export function createCategoryStore(db: Database): CategoryStore {
  return {
    list: (userId) => db.category.findMany({ where: { userId }, select: fields, orderBy: { name: 'asc' } }),

    create: async (userId, input) => {
      try {
        return await db.category.create({ data: { userId, ...input }, select: fields })
      } catch (error) {
        if (isDuplicateName(error)) throw new ConflictError(DUPLICATE_NAME)
        throw error
      }
    },

    update: async (userId, id, changes) => {
      const existing = await db.category.findFirst({ where: { id, userId } })
      if (!existing) return null
      try {
        return await db.category.update({ where: { id }, data: changes, select: fields })
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
