import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import {
  createFakeCategoryStore,
  createFakeTransactionStore,
  fakeDependencies,
  type StoredAccount,
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
const checkingId = '30000000-0000-0000-0000-000000000001'
const cardId = '30000000-0000-0000-0000-000000000002'
const othersAccountId = '30000000-0000-0000-0000-000000000003'

function setup() {
  const categoryRows = [
    { id: groceriesId, userId: testUser.id, name: 'Groceries', kind: 'EXPENSE' as const },
    { id: othersCategoryId, userId: otherUser.id, name: 'Gas', kind: 'EXPENSE' as const },
  ]
  const accountRows: StoredAccount[] = [
    { id: checkingId, userId: testUser.id, name: 'Checking', type: 'BANK', startingBalanceCents: 0, startDate: '2026-01-01' },
    { id: cardId, userId: testUser.id, name: 'Amazon Card', type: 'CREDIT_CARD', startingBalanceCents: 0, startDate: '2026-01-01' },
    { id: othersAccountId, userId: otherUser.id, name: 'Checking', type: 'BANK', startingBalanceCents: 0, startDate: '2026-01-01' },
  ]
  const store = createFakeTransactionStore(
    [
      { id: meijerId, userId: testUser.id, date: '2026-10-15', description: 'Meijer', amountCents: 8412, categoryId: groceriesId, accountId: cardId },
      { id: shellId, userId: testUser.id, date: '2026-10-14', description: 'Shell', amountCents: 4830, categoryId: null, accountId: checkingId },
      { id: septemberId, userId: testUser.id, date: '2026-09-30', description: 'Rent', amountCents: 120000, categoryId: null, accountId: checkingId },
      { id: othersTransactionId, userId: otherUser.id, date: '2026-10-10', description: 'Other', amountCents: 500, categoryId: null, accountId: othersAccountId },
    ],
    categoryRows,
    accountRows,
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
      { id: meijerId, date: '2026-10-15', description: 'Meijer', amountCents: 8412, categoryId: groceriesId, accountId: cardId, transferAccountId: null },
      { id: shellId, date: '2026-10-14', description: 'Shell', amountCents: 4830, categoryId: null, accountId: checkingId, transferAccountId: null },
    ])
  })

  it('lists all of the user\'s transactions when no month is given', async () => {
    const { app } = setup()

    const response = await request(app).get('/api/transactions').set(auth)

    expect(response.status).toBe(200)
    expect(response.body.map((t: { id: string }) => t.id)).toEqual([meijerId, shellId, septemberId])
  })

  it('rejects a month it cannot read', async () => {
    const { app } = setup()

    const response = await request(app).get('/api/transactions?month=October').set(auth)

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
    // No account given, so it goes in the main bank account
    expect(response.body).toEqual({ id: expect.any(String), ...newTransaction, accountId: checkingId, transferAccountId: null })
    expect(store.rows).toContainEqual({ ...response.body, userId: testUser.id })
  })

  it('adds a transaction to the account given', async () => {
    const { app } = setup()

    const response = await request(app).post('/api/transactions').set(auth).send({ ...newTransaction, accountId: cardId })

    expect(response.body.accountId).toBe(cardId)
  })

  it("rejects another user's account", async () => {
    const { app } = setup()

    const response = await request(app).post('/api/transactions').set(auth).send({ ...newTransaction, accountId: othersAccountId })

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Account not found')
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
    expect(response.body).toEqual({ id: meijerId, date: '2026-10-15', description: 'Meijer', amountCents: 9000, categoryId: null, accountId: cardId, transferAccountId: null })
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

describe('transfers', () => {
  const payoff = { date: '2026-10-20', description: 'Pay off Amazon card', amountCents: 8412, accountId: checkingId, transferAccountId: cardId }

  it('adds a transfer from one account to another, with no category', async () => {
    const { app } = setup()

    const response = await request(app).post('/api/transactions').set(auth).send(payoff)

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({ ...payoff, categoryId: null })
  })

  it("won't give a transfer a category", async () => {
    const { app } = setup()

    const response = await request(app).post('/api/transactions').set(auth).send({ ...payoff, categoryId: groceriesId })

    expect(response.status).toBe(400)
    expect(response.body.error).toBe("A transfer between accounts can't have a category")
  })

  it('needs two different accounts', async () => {
    const { app } = setup()

    const response = await request(app).post('/api/transactions').set(auth).send({ ...payoff, transferAccountId: checkingId })

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('A transfer has to go to a different account')
  })

  it("rejects a transfer to another user's account", async () => {
    const { app } = setup()

    const response = await request(app).post('/api/transactions').set(auth).send({ ...payoff, transferAccountId: othersAccountId })

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Account not found')
  })

  it('turns a transaction into a transfer, clearing its category, and back', async () => {
    const { app } = setup()

    const transfer = await request(app).patch(`/api/transactions/${meijerId}`).set(auth).send({ transferAccountId: checkingId })
    const plain = await request(app).patch(`/api/transactions/${meijerId}`).set(auth).send({ categoryId: groceriesId })

    expect(transfer.body).toMatchObject({ accountId: cardId, transferAccountId: checkingId, categoryId: null })
    expect(plain.body).toMatchObject({ transferAccountId: null, categoryId: groceriesId })
  })

  it("won't move a transfer's account onto the account it goes to", async () => {
    const { app } = setup()
    const created = await request(app).post('/api/transactions').set(auth).send(payoff)

    const response = await request(app).patch(`/api/transactions/${created.body.id}`).set(auth).send({ accountId: cardId })

    expect(response.status).toBe(400)
  })

  it('imports transfers too', async () => {
    const { app, store } = setup()

    const response = await request(app).post('/api/transactions/import').set(auth).send({ transactions: [payoff] })

    expect(response.status).toBe(201)
    expect(store.rows).toContainEqual(expect.objectContaining({ description: 'Pay off Amazon card', transferAccountId: cardId }))
  })
})
