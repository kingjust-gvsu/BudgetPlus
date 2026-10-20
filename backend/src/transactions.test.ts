import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import {
  createFakeCategoryStore,
  createFakeTransactionStore,
  fakeDependencies,
  OTHER_USER_TOKEN,
  otherUser,
  testUser,
  VALID_TOKEN,
} from './test/fakes.ts'
import { monthRange } from './transactions.ts'

const config = { corsOrigin: 'http://localhost:5173' }
const auth = { Authorization: `Bearer ${VALID_TOKEN}` }
const otherAuth = { Authorization: `Bearer ${OTHER_USER_TOKEN}` }

const groceriesId = '10000000-0000-0000-0000-000000000001'
const othersCategoryId = '10000000-0000-0000-0000-000000000002'
const meijerId = '20000000-0000-0000-0000-000000000001'
const shellId = '20000000-0000-0000-0000-000000000002'
const septemberId = '20000000-0000-0000-0000-000000000003'
const othersTransactionId = '20000000-0000-0000-0000-000000000004'

function setup() {
  const categoryRows = [
    { id: groceriesId, userId: testUser.id, name: 'Groceries', kind: 'EXPENSE' as const },
    { id: othersCategoryId, userId: otherUser.id, name: 'Gas', kind: 'EXPENSE' as const },
  ]
  const store = createFakeTransactionStore(
    [
      { id: meijerId, userId: testUser.id, date: '2026-10-15', description: 'Meijer', amountCents: 8412, categoryId: groceriesId },
      { id: shellId, userId: testUser.id, date: '2026-10-14', description: 'Shell', amountCents: 4830, categoryId: null },
      { id: septemberId, userId: testUser.id, date: '2026-09-30', description: 'Rent', amountCents: 120000, categoryId: null },
      { id: othersTransactionId, userId: otherUser.id, date: '2026-10-10', description: 'Other', amountCents: 500, categoryId: null },
    ],
    categoryRows,
  )
  const deps = fakeDependencies({ categories: createFakeCategoryStore(categoryRows), transactions: store })
  return { app: createApp(config, deps), store }
}

const newTransaction = { date: '2026-10-17', description: 'Pizza place', amountCents: 3275, categoryId: groceriesId }

describe('GET /api/transactions', () => {
  it("lists the user's transactions for the month, newest first", async () => {
    const { app } = setup()

    const response = await request(app).get('/api/transactions?month=2026-10').set(auth)

    expect(response.status).toBe(200)
    expect(response.body).toEqual([
      { id: meijerId, date: '2026-10-15', description: 'Meijer', amountCents: 8412, categoryId: groceriesId },
      { id: shellId, date: '2026-10-14', description: 'Shell', amountCents: 4830, categoryId: null },
    ])
  })

  it('requires a month', async () => {
    const { app } = setup()

    const response = await request(app).get('/api/transactions').set(auth)

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'month must be a month like 2026-10' })
  })

  it('requires sign-in', async () => {
    const { app } = setup()

    const response = await request(app).get('/api/transactions?month=2026-10')

    expect(response.status).toBe(401)
  })
})

describe('POST /api/transactions', () => {
  it('adds a transaction', async () => {
    const { app, store } = setup()

    const response = await request(app).post('/api/transactions').set(auth).send(newTransaction)

    expect(response.status).toBe(201)
    expect(response.body).toEqual({ id: expect.any(String), ...newTransaction })
    expect(store.rows).toContainEqual({ ...response.body, userId: testUser.id })
  })

  it('allows an uncategorized transaction and a refund', async () => {
    const { app } = setup()

    const response = await request(app)
      .post('/api/transactions')
      .set(auth)
      .send({ date: '2026-10-08', description: 'Target refund', amountCents: -1800 })

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({ amountCents: -1800, categoryId: null })
  })

  it.each([
    ['an impossible date', { date: '2026-02-30' }, 'Date is not a real date'],
    ['a date in the wrong format', { date: '10/17/2026' }, 'Date must be a date like 2026-10-15'],
    ['a missing description', { description: ' ' }, 'Description is required'],
    ['an amount in dollars instead of cents', { amountCents: 32.75 }, 'Amount must be a whole number of cents'],
    ['an amount sent as text', { amountCents: '3275' }, 'Amount must be a whole number of cents'],
    ['a zero amount', { amountCents: 0 }, "Amount can't be zero"],
  ])('rejects %s', async (_case, change, error) => {
    const { app } = setup()

    const response = await request(app).post('/api/transactions').set(auth).send({ ...newTransaction, ...change })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error })
  })

  it("rejects another user's category", async () => {
    const { app } = setup()

    const response = await request(app)
      .post('/api/transactions')
      .set(auth)
      .send({ ...newTransaction, categoryId: othersCategoryId })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'Category not found' })
  })
})

describe('PATCH /api/transactions/:id', () => {
  it('changes the amount and removes the category', async () => {
    const { app } = setup()

    const response = await request(app)
      .patch(`/api/transactions/${meijerId}`)
      .set(auth)
      .send({ amountCents: 9000, categoryId: null })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ id: meijerId, date: '2026-10-15', description: 'Meijer', amountCents: 9000, categoryId: null })
  })

  it('rejects an empty change', async () => {
    const { app } = setup()

    const response = await request(app).patch(`/api/transactions/${meijerId}`).set(auth).send({})

    expect(response.status).toBe(400)
  })

  it("can't change another user's transaction", async () => {
    const { app, store } = setup()

    const response = await request(app).patch(`/api/transactions/${meijerId}`).set(otherAuth).send({ amountCents: 1 })

    expect(response.status).toBe(404)
    expect(store.rows.find((r) => r.id === meijerId)?.amountCents).toBe(8412)
  })
})

describe('DELETE /api/transactions/:id', () => {
  it('deletes a transaction', async () => {
    const { app, store } = setup()

    const response = await request(app).delete(`/api/transactions/${shellId}`).set(auth)

    expect(response.status).toBe(204)
    expect(store.rows.some((r) => r.id === shellId)).toBe(false)
  })

  it("can't delete another user's transaction", async () => {
    const { app, store } = setup()

    const response = await request(app).delete(`/api/transactions/${othersTransactionId}`).set(auth)

    expect(response.status).toBe(404)
    expect(store.rows.some((r) => r.id === othersTransactionId)).toBe(true)
  })
})

describe('monthRange', () => {
  it('covers the whole month, including across a year boundary', () => {
    const { start, end } = monthRange('2026-12')

    expect(start.toISOString()).toBe('2026-12-01T00:00:00.000Z')
    expect(end.toISOString()).toBe('2027-01-01T00:00:00.000Z')
  })
})
