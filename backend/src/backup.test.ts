import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from './app.ts'
import { parseBackup, type Backup } from './backup.ts'
import { fakeDependencies, testUser, VALID_TOKEN } from './test/fakes.ts'

const valid = {
  format: 'budget-plus-backup',
  version: 1,
  exportedAt: '2026-11-13T21:04:00.000Z',
  monthlyIncomeCents: 400000,
  categories: [
    { name: 'Rent', kind: 'BILL', budgetCents: 120000, createdOn: '2026-09-01' },
    { name: 'Car insurance', kind: 'BILL', budgetCents: 60000, frequencyMonths: 6, nextDueDate: '2027-03-15', createdOn: '2026-03-01' },
    { name: 'Groceries', kind: 'EXPENSE', budgetType: 'PERCENT_OF_INCOME', budgetPercent: 12, createdOn: '2026-09-01' },
    { name: 'Savings', kind: 'EXPENSE', budgetType: 'REMAINDER', createdOn: '2026-09-01' },
  ],
  transactions: [
    { date: '2026-09-01', description: 'Landlord', amountCents: 120000, category: 'Rent' },
    { date: '2026-09-15', description: 'Progressive', amountCents: 60000, category: 'Car insurance' },
    { date: '2026-09-16', description: 'Coffee', amountCents: 450, category: null },
  ],
}

const withChanges = (changes: Record<string, unknown>) => ({ ...valid, ...changes })

describe('parseBackup', () => {
  it('accepts a valid backup, filling in budget defaults the same way the app does', () => {
    const backup = parseBackup(valid)

    expect(backup.categories[0]).toEqual({
      name: 'Rent',
      kind: 'BILL',
      budgetType: 'FIXED',
      budgetCents: 120000,
      budgetPercent: null,
      frequencyMonths: 1,
      nextDueDate: null,
      createdOn: '2026-09-01',
    })
    expect(backup.transactions).toHaveLength(3)
  })

  it.each([
    ['not a backup', { hello: 'world' }, "This isn't a Budget+ backup file"],
    ['a newer version', withChanges({ version: 2 }), 'This backup is version 2; only version 1 can be restored'],
    ['a bill with a percent budget', withChanges({ categories: [{ name: 'Rent', kind: 'BILL', budgetType: 'PERCENT_OF_INCOME', budgetPercent: 10 }] }), 'Category 1: Bills use a fixed estimate'],
    ['a non-monthly bill without a due date', withChanges({ categories: [{ name: 'Insurance', kind: 'BILL', budgetCents: 600, frequencyMonths: 6 }] }), "Category 1: Enter when a bill that isn't monthly is next due"],
    ['two categories with the same name', withChanges({ categories: [{ name: 'Gas', kind: 'EXPENSE' }, { name: 'Gas', kind: 'BILL' }], transactions: [] }), 'Two categories are named "Gas"'],
    ['two remainders', withChanges({ categories: [{ name: 'A', kind: 'EXPENSE', budgetType: 'REMAINDER' }, { name: 'B', kind: 'EXPENSE', budgetType: 'REMAINDER' }], transactions: [] }), 'Only one category can be the remainder'],
    ['percents over 100%', withChanges({ categories: [{ name: 'A', kind: 'EXPENSE', budgetType: 'PERCENT_OF_INCOME', budgetPercent: 60 }, { name: 'B', kind: 'EXPENSE', budgetType: 'PERCENT_OF_INCOME', budgetPercent: 50 }], transactions: [] }), 'Percent budgets would total 110% of income. The most is 100%.'],
    ['a transaction for a category that is not in the file', withChanges({ transactions: [{ date: '2026-09-01', description: 'X', amountCents: 1, category: 'Gas' }] }), 'Transaction 1: no category named "Gas" in the backup'],
    ['a transaction with a bad date', withChanges({ transactions: [{ date: '2026-02-30', description: 'X', amountCents: 1, category: null }] }), 'Transaction 1: Date is not a real date'],
  ])('rejects %s', (_case, input, message) => {
    expect(() => parseBackup(input)).toThrow(message)
  })
})

describe('sample backups', () => {
  it.each([
    ['full-budget-3-months.json', 11, 72],
    ['full-budget-12-months.json', 13, 289],
  ])('sample-data/%s is a valid backup', (name, categories, transactions) => {
    // Tests run from the backend folder; sample-data/ sits beside it
    const file = JSON.parse(readFileSync(resolve(process.cwd(), '../sample-data', name), 'utf-8'))

    const backup = parseBackup(file)

    expect(backup.categories).toHaveLength(categories)
    expect(backup.transactions).toHaveLength(transactions)
  })
})

describe('/api/backup', () => {
  const auth = { Authorization: `Bearer ${VALID_TOKEN}` }

  it("downloads the signed-in user's backup", async () => {
    const backup = parseBackup(valid)
    const exportFn = vi.fn().mockResolvedValue(backup)
    const app = createApp({ corsOrigin: 'http://localhost:5173' }, fakeDependencies({ backup: { export: exportFn, restore: vi.fn() } }))

    const response = await request(app).get('/api/backup').set(auth)

    expect(response.status).toBe(200)
    expect(exportFn).toHaveBeenCalledWith(testUser.id)
    expect(response.body.categories).toHaveLength(4)
  })

  it('restores a valid backup', async () => {
    const restore = vi.fn(async (_userId: string, backup: Backup) => ({ categories: backup.categories.length, transactions: backup.transactions.length }))
    const app = createApp({ corsOrigin: 'http://localhost:5173' }, fakeDependencies({ backup: { export: vi.fn(), restore } }))

    const response = await request(app).post('/api/backup/restore').set(auth).send(valid)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ categories: 4, transactions: 3 })
    expect(restore).toHaveBeenCalledWith(testUser.id, expect.objectContaining({ monthlyIncomeCents: 400000 }))
  })

  it('changes nothing when the backup has a problem', async () => {
    const restore = vi.fn()
    const app = createApp({ corsOrigin: 'http://localhost:5173' }, fakeDependencies({ backup: { export: vi.fn(), restore } }))

    const response = await request(app).post('/api/backup/restore').set(auth).send(withChanges({ version: 9 }))

    expect(response.status).toBe(400)
    expect(restore).not.toHaveBeenCalled()
  })
})
