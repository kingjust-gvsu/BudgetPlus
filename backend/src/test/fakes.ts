import { randomUUID } from 'node:crypto'
import {
  ACCOUNT_HAS_TRANSACTIONS,
  ACCOUNT_NAME_TAKEN,
  ACCOUNT_NOT_FOUND,
  balanceOf,
  DEFAULT_ACCOUNT_NAME,
  sortAccounts,
  type Account,
  type AccountInput,
  type AccountStore,
} from '../accounts.ts'
import type { AppDependencies } from '../app.ts'
import type { AuthenticatedUser } from '../auth.ts'
import {
  categoriesInMonth,
  categoryInMonth,
  DEFAULT_BUDGET_SETTINGS,
  recordAfterCreate,
  recordAfterDelete,
  recordAfterUpdate,
  type BudgetSettings,
  type Category,
  type CategoryRecord,
  type CategoryStore,
} from '../categories.ts'
import { ConflictError, ValidationError } from '../errors.ts'
import {
  CATEGORY_NOT_FOUND,
  checkTransferAccounts,
  settleTransferChange,
  withoutDuplicates,
  type Transaction,
  type TransactionInput,
  type TransactionStore,
} from '../transactions.ts'
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

type StoredCategory = CategoryRecord & { userId: string }

// Tests can give just id, name, and kind; the budget settings default like a new category's.
// Seeded categories have had their budget since long ago, so they're in use in any month.
type CategorySeed = Omit<Category, keyof BudgetSettings> & Partial<BudgetSettings> & { userId: string }

export const SEEDED_SINCE = '2000-01'

// Behaves like the real category store (it uses the same budget history rules), but keeps
// everything in memory.
export function createFakeCategoryStore(seeds: CategorySeed[] = []): CategoryStore & { rows: StoredCategory[] } {
  // Turn seeds into records on the same objects, so other fakes sharing this list see changes
  for (const seed of seeds) {
    const settings = { ...DEFAULT_BUDGET_SETTINGS, ...Object.fromEntries(Object.entries(seed).filter(([, v]) => v !== undefined)) }
    Object.assign(seed, {
      frequencyMonths: settings.frequencyMonths,
      nextDueDate: settings.nextDueDate,
      budgets: [
        {
          month: SEEDED_SINCE,
          stopped: false,
          budgetType: settings.budgetType,
          budgetCents: settings.budgetCents,
          budgetPercent: settings.budgetPercent,
        },
      ],
    })
  }
  const rows = seeds as unknown as StoredCategory[]
  const recordsOf = (userId: string) => rows.filter((r) => r.userId === userId)
  const save = (userId: string, record: CategoryRecord) => {
    const existing = rows.find((r) => r.id === record.id)
    if (existing) Object.assign(existing, record)
    else rows.push({ ...record, userId })
  }

  return {
    rows,
    list: async (userId, month) => categoriesInMonth(recordsOf(userId), month),
    create: async (userId, input, month) => {
      const record = recordAfterCreate(recordsOf(userId), input, month, randomUUID())
      save(userId, record)
      return categoryInMonth(record, month)!
    },
    update: async (userId, id, changes, month) => {
      const record = recordAfterUpdate(recordsOf(userId), id, changes, month)
      if (!record) return null
      save(userId, record)
      return categoryInMonth(record, month)
    },
    delete: async (userId, id, month) => {
      const result = recordAfterDelete(recordsOf(userId), id, month)
      if (result === null) return false
      if (result === 'delete') rows.splice(rows.findIndex((r) => r.id === id), 1)
      else save(userId, result)
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

export type StoredAccount = AccountInput & { id: string; userId: string }
type StoredTransaction = Transaction & { userId: string }
// Tests can leave out the account (those go in the user's main bank account) and the transfer
type TransactionSeed = Omit<Transaction, 'accountId' | 'transferAccountId'> & {
  accountId?: string
  transferAccountId?: string | null
  userId: string
}

// The user's first bank account, or a new "Checking" one, like the real store's default
function defaultAccount(accounts: StoredAccount[], userId: string, date: string): string {
  const bank = accounts.find((a) => a.userId === userId && a.type === 'BANK')
  if (bank) return bank.id
  const id = randomUUID()
  accounts.push({ id, userId, name: DEFAULT_ACCOUNT_NAME, type: 'BANK', startingBalanceCents: 0, startDate: date })
  return id
}

// Behaves like the real account store, but keeps everything in memory. Balances come from
// `transactions` (share it with a fake transaction store).
export function createFakeAccountStore(
  accounts: StoredAccount[] = [],
  transactions: Pick<StoredTransaction, 'accountId' | 'transferAccountId' | 'date' | 'amountCents'>[] = [],
): AccountStore & { rows: StoredAccount[] } {
  const toAccount = ({ userId: _userId, ...account }: StoredAccount): Account => ({
    ...account,
    balanceCents: balanceOf(account, transactions),
  })
  const nameTaken = (userId: string, name: string, id?: string) =>
    accounts.some((a) => a.userId === userId && a.name === name && a.id !== id)

  return {
    rows: accounts,
    list: async (userId) => sortAccounts(accounts.filter((a) => a.userId === userId).map(toAccount)),
    create: async (userId, input) => {
      if (nameTaken(userId, input.name)) throw new ConflictError(ACCOUNT_NAME_TAKEN)
      const row = { id: randomUUID(), userId, ...input }
      accounts.push(row)
      return toAccount(row)
    },
    update: async (userId, id, changes) => {
      const row = accounts.find((a) => a.id === id && a.userId === userId)
      if (!row) return null
      if (changes.name !== undefined && nameTaken(userId, changes.name, id)) throw new ConflictError(ACCOUNT_NAME_TAKEN)
      Object.assign(row, changes)
      return toAccount(row)
    },
    delete: async (userId, id) => {
      const index = accounts.findIndex((a) => a.id === id && a.userId === userId)
      if (index === -1) return false
      if (transactions.some((t) => t.accountId === id || t.transferAccountId === id)) throw new ConflictError(ACCOUNT_HAS_TRANSACTIONS)
      accounts.splice(index, 1)
      return true
    },
  }
}

// Behaves like the real transaction store, but keeps everything in memory. `categories` is the
// category list it checks ownership against (share it with a fake category store), and `accounts`
// the account list (share it with a fake account store).
export function createFakeTransactionStore(
  seeds: TransactionSeed[] = [],
  categories: Pick<StoredCategory, 'id' | 'userId'>[] = [],
  accounts: StoredAccount[] = [],
): TransactionStore & { rows: StoredTransaction[] } {
  for (const seed of seeds) {
    seed.accountId ??= defaultAccount(accounts, seed.userId, seed.date)
    seed.transferAccountId ??= null
  }
  const rows = seeds as StoredTransaction[]
  const toTransaction = ({ id, date, description, amountCents, categoryId, accountId, transferAccountId }: StoredTransaction): Transaction => ({
    id,
    date,
    description,
    amountCents,
    categoryId,
    accountId,
    transferAccountId,
  })
  // A new row from an input, like the real store makes
  const newRow = (userId: string, rawInput: TransactionInput): StoredTransaction => {
    const input = settleTransferChange(rawInput) as TransactionInput
    checkCategory(userId, input.categoryId)
    checkAccount(userId, input.accountId)
    checkAccount(userId, input.transferAccountId)
    const accountId = input.accountId ?? defaultAccount(accounts, userId, input.date)
    const row = { id: randomUUID(), userId, ...input, accountId, transferAccountId: input.transferAccountId ?? null }
    checkTransferAccounts(row)
    return row
  }
  const checkCategory = (userId: string, categoryId: string | null | undefined) => {
    if (categoryId && !categories.some((c) => c.id === categoryId && c.userId === userId)) {
      throw new ValidationError(CATEGORY_NOT_FOUND)
    }
  }
  const checkAccount = (userId: string, accountId: string | null | undefined) => {
    if (accountId && !accounts.some((a) => a.id === accountId && a.userId === userId)) {
      throw new ValidationError(ACCOUNT_NOT_FOUND)
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
      const row = newRow(userId, input)
      rows.push(row)
      return toTransaction(row)
    },
    update: async (userId, id, rawChanges) => {
      const row = rows.find((r) => r.id === id && r.userId === userId)
      if (!row) return null
      const changes = settleTransferChange(rawChanges)
      checkCategory(userId, changes.categoryId)
      checkAccount(userId, changes.accountId)
      checkAccount(userId, changes.transferAccountId)
      checkTransferAccounts({ ...row, ...changes } as StoredTransaction)
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
      const toAdd = withoutDuplicates(inputs, rows.filter((r) => r.userId === userId))
      // All or nothing: make every row first, so one bad row adds none
      const newRows = toAdd.map((input) => newRow(userId, input))
      for (const input of inputs) newRow(userId, input)
      rows.push(...newRows)
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
    accounts: createFakeAccountStore(),
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
