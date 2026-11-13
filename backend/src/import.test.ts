import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import {
  createFakeCategoryStore,
  createFakeTransactionStore,
  fakeDependencies,
  otherUser,
  testUser,
  VALID_TOKEN,
} from './test/fakes.ts'
import { withoutDuplicates } from './transactions.ts'

const auth = { Authorization: `Bearer ${VALID_TOKEN}` }
const groceriesId = '10000000-0000-0000-0000-000000000001'
const othersCategoryId = '10000000-0000-0000-0000-000000000002'

function setup() {
  const categories = [
    { id: groceriesId, userId: testUser.id, name: 'Groceries', kind: 'EXPENSE' as const },
    { id: othersCategoryId, userId: otherUser.id, name: 'Gas', kind: 'EXPENSE' as const },
  ]
  const store = createFakeTransactionStore(
    [{ id: 't1', userId: testUser.id, date: '2026-10-15', description: 'Meijer', amountCents: 8412, categoryId: groceriesId }],
    categories,
  )
  const app = createApp(
    { corsOrigin: 'http://localhost:5173' },
    fakeDependencies({ categories: createFakeCategoryStore(categories), transactions: store }),
  )
  return { app, store }
}

const importRows = (app: ReturnType<typeof setup>['app'], transactions: unknown[]) =>
  request(app).post('/api/transactions/import').set(auth).send({ transactions })

describe('POST /api/transactions/import', () => {
  it('adds every row', async () => {
    const { app, store } = setup()

    const response = await importRows(app, [
      { date: '2026-10-16', description: 'Shell', amountCents: 4830 },
      { date: '2026-10-17', description: 'Pizza place', amountCents: 3275, categoryId: groceriesId },
      { date: '2026-10-18', description: 'Target refund', amountCents: -1800, categoryId: null },
    ])

    expect(response.status).toBe(201)
    expect(response.body).toEqual({ imported: 3, duplicates: 0 })
    expect(store.rows.filter((r) => r.userId === testUser.id)).toHaveLength(4)
  })

  it('skips transactions the user already has, so a file can be imported twice', async () => {
    const { app, store } = setup()

    const response = await importRows(app, [
      { date: '2026-10-15', description: 'MEIJER', amountCents: 8412 },
      { date: '2026-10-16', description: 'Shell', amountCents: 4830 },
    ])

    expect(response.body).toEqual({ imported: 1, duplicates: 1 })
    expect(store.rows).toHaveLength(2)
  })

  it('reports every bad row by number and adds nothing', async () => {
    const { app, store } = setup()

    const response = await importRows(app, [
      { date: '2026-10-16', description: 'Shell', amountCents: 4830 },
      { date: '2026-02-30', description: 'Bad date', amountCents: 100 },
      { date: '2026-10-18', description: '', amountCents: 100 },
      { date: '2026-10-19', description: 'Dollars, not cents', amountCents: 12.5 },
    ])

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: '3 row(s) have problems',
      problems: [
        { row: 2, error: 'Date is not a real date' },
        { row: 3, error: 'Description is required' },
        { row: 4, error: 'Amount must be a whole number of cents' },
      ],
    })
    expect(store.rows).toHaveLength(1)
  })

  it("rejects another user's category and adds nothing", async () => {
    const { app, store } = setup()

    const response = await importRows(app, [
      { date: '2026-10-16', description: 'Shell', amountCents: 4830 },
      { date: '2026-10-17', description: 'Gas', amountCents: 4000, categoryId: othersCategoryId },
    ])

    expect(response.status).toBe(400)
    expect(store.rows).toHaveLength(1)
  })

  it('needs at least one row', async () => {
    const { app } = setup()

    const response = await importRows(app, [])

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'Send at least one transaction to import' })
  })

  it('accepts a few thousand rows', async () => {
    const { app } = setup()
    const rows = Array.from({ length: 3000 }, (_, i) => ({
      date: '2026-09-01',
      description: `Coffee shop purchase number ${i}`,
      amountCents: 450 + i,
    }))

    const response = await importRows(app, rows)

    expect(response.status).toBe(201)
    expect(response.body.imported).toBe(3000)
  })
})

describe('withoutDuplicates', () => {
  it('only skips as many identical transactions as already exist', () => {
    const coffee = { date: '2026-10-16', description: 'Coffee', amountCents: 450 }

    expect(withoutDuplicates([coffee, coffee, coffee], [coffee])).toHaveLength(2)
  })
})
