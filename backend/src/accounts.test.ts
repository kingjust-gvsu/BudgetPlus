import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { balanceOf, sortAccounts } from './accounts.ts'
import { createApp } from './app.ts'
import {
  createFakeAccountStore,
  createFakeTransactionStore,
  fakeDependencies,
  OTHER_USER_TOKEN,
  otherUser,
  testUser,
  VALID_TOKEN,
  type StoredAccount,
} from './test/fakes.ts'

const config = { corsOrigin: 'http://localhost:5173' }
const auth = { Authorization: `Bearer ${VALID_TOKEN}` }
const otherAuth = { Authorization: `Bearer ${OTHER_USER_TOKEN}` }

const checkingId = '30000000-0000-0000-0000-000000000001'
const cardId = '30000000-0000-0000-0000-000000000002'
const fundId = '30000000-0000-0000-0000-000000000003'
const othersId = '30000000-0000-0000-0000-000000000004'

function setup() {
  const accounts: StoredAccount[] = [
    { id: fundId, userId: testUser.id, name: 'Car insurance fund', type: 'FUND', startingBalanceCents: 94800, startDate: '2026-10-01' },
    { id: cardId, userId: testUser.id, name: 'Amazon Card', type: 'CREDIT_CARD', startingBalanceCents: -20000, startDate: '2026-10-01' },
    { id: checkingId, userId: testUser.id, name: 'Checking', type: 'BANK', startingBalanceCents: 500000, startDate: '2026-10-01' },
    { id: othersId, userId: otherUser.id, name: 'Savings', type: 'BANK', startingBalanceCents: 100, startDate: '2026-10-01' },
  ]
  const transactions = createFakeTransactionStore(
    [
      // Before Checking's start date, so it doesn't change the balance
      { id: '20000000-0000-0000-0000-000000000001', userId: testUser.id, date: '2026-09-30', description: 'Old', amountCents: 999, categoryId: null, accountId: checkingId },
      { id: '20000000-0000-0000-0000-000000000002', userId: testUser.id, date: '2026-10-02', description: 'Rent', amountCents: 120000, categoryId: null, accountId: checkingId },
      { id: '20000000-0000-0000-0000-000000000003', userId: testUser.id, date: '2026-10-05', description: 'Refund', amountCents: -2500, categoryId: null, accountId: checkingId },
      { id: '20000000-0000-0000-0000-000000000004', userId: testUser.id, date: '2026-10-06', description: 'Books', amountCents: 4000, categoryId: null, accountId: cardId },
    ],
    [],
    accounts,
  )
  const store = createFakeAccountStore(accounts, transactions.rows)
  return { app: createApp(config, fakeDependencies({ accounts: store, transactions })), store }
}

describe('balanceOf', () => {
  it('starts from the starting balance and counts transactions from the start date on', () => {
    const account = { name: 'Checking', type: 'BANK' as const, startingBalanceCents: 10000, startDate: '2026-10-01' }

    expect(balanceOf(account, [
      { date: '2026-09-30', amountCents: 5000 }, // before the start date
      { date: '2026-10-01', amountCents: 3000 }, // spent
      { date: '2026-10-09', amountCents: -500 }, // money back
    ])).toBe(10000 - 3000 + 500)
  })

  it("makes spending on a credit card add to what's owed", () => {
    const card = { name: 'Card', type: 'CREDIT_CARD' as const, startingBalanceCents: -20000, startDate: '2026-10-01' }

    expect(balanceOf(card, [{ date: '2026-10-06', amountCents: 4000 }])).toBe(-24000)
  })
})

describe('sortAccounts', () => {
  it('puts bank accounts first, then credit cards, then funds, each by name', () => {
    const sorted = sortAccounts([
      { name: 'House fund', type: 'FUND' as const },
      { name: 'Meijer Card', type: 'CREDIT_CARD' as const },
      { name: 'Savings', type: 'BANK' as const },
      { name: 'Amazon Card', type: 'CREDIT_CARD' as const },
      { name: 'Checking', type: 'BANK' as const },
    ])

    expect(sorted.map((a) => a.name)).toEqual(['Checking', 'Savings', 'Amazon Card', 'Meijer Card', 'House fund'])
  })
})

describe('GET /api/accounts', () => {
  it("lists the user's accounts with balances, in order", async () => {
    const { app } = setup()

    const response = await request(app).get('/api/accounts').set(auth)

    expect(response.status).toBe(200)
    expect(response.body).toEqual([
      { id: checkingId, name: 'Checking', type: 'BANK', startingBalanceCents: 500000, startDate: '2026-10-01', balanceCents: 500000 - 120000 + 2500 },
      { id: cardId, name: 'Amazon Card', type: 'CREDIT_CARD', startingBalanceCents: -20000, startDate: '2026-10-01', balanceCents: -24000 },
      { id: fundId, name: 'Car insurance fund', type: 'FUND', startingBalanceCents: 94800, startDate: '2026-10-01', balanceCents: 94800 },
    ])
  })

  it('requires sign-in', async () => {
    const { app } = setup()

    expect((await request(app).get('/api/accounts')).status).toBe(401)
  })
})

describe('POST /api/accounts', () => {
  const newAccount = { name: 'House fund', type: 'FUND', startingBalanceCents: 0, startDate: '2026-11-01' }

  it('adds an account', async () => {
    const { app } = setup()

    const response = await request(app).post('/api/accounts').set(auth).send(newAccount)

    expect(response.status).toBe(201)
    expect(response.body).toEqual({ id: expect.any(String), ...newAccount, balanceCents: 0 })
  })

  it('allows a negative starting balance, like a fund that went below zero', async () => {
    const { app } = setup()

    const response = await request(app).post('/api/accounts').set(auth).send({ ...newAccount, startingBalanceCents: -211230 })

    expect(response.status).toBe(201)
    expect(response.body.balanceCents).toBe(-211230)
  })

  it('rejects a name the user already has', async () => {
    const { app } = setup()

    const response = await request(app).post('/api/accounts').set(auth).send({ ...newAccount, name: 'Checking' })

    expect(response.status).toBe(409)
    expect(response.body.error).toBe('You already have an account with that name')
  })

  it.each([
    ['no name', { ...newAccount, name: ' ' }, 'Name is required'],
    ['an unknown type', { ...newAccount, type: 'LOAN' }, 'Type must be one of: BANK, CREDIT_CARD, FUND'],
    ['a decimal balance', { ...newAccount, startingBalanceCents: 10.5 }, 'Starting balance must be a whole number of cents'],
    ['no start date', { ...newAccount, startDate: undefined }, 'Start date must be a date like 2026-10-15'],
  ])('rejects %s', async (_case, body, error) => {
    const { app } = setup()

    const response = await request(app).post('/api/accounts').set(auth).send(body)

    expect(response.status).toBe(400)
    expect(response.body.error).toBe(error)
  })
})

describe('PATCH /api/accounts/:id', () => {
  it('changes the starting balance, which changes the balance', async () => {
    const { app } = setup()

    const response = await request(app).patch(`/api/accounts/${cardId}`).set(auth).send({ startingBalanceCents: -10000 })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ startingBalanceCents: -10000, balanceCents: -14000 })
  })

  it("can't change another user's account", async () => {
    const { app } = setup()

    const response = await request(app).patch(`/api/accounts/${checkingId}`).set(otherAuth).send({ name: 'Mine' })

    expect(response.status).toBe(404)
  })

  it('needs something to change', async () => {
    const { app } = setup()

    expect((await request(app).patch(`/api/accounts/${cardId}`).set(auth).send({})).status).toBe(400)
  })
})

describe('DELETE /api/accounts/:id', () => {
  it('deletes an account with no transactions', async () => {
    const { app, store } = setup()

    const response = await request(app).delete(`/api/accounts/${fundId}`).set(auth)

    expect(response.status).toBe(204)
    expect(store.rows.some((a) => a.id === fundId)).toBe(false)
  })

  it("won't delete an account that has transactions", async () => {
    const { app, store } = setup()

    const response = await request(app).delete(`/api/accounts/${checkingId}`).set(auth)

    expect(response.status).toBe(409)
    expect(response.body.error).toBe('This account has transactions. Move or delete them first.')
    expect(store.rows.some((a) => a.id === checkingId)).toBe(true)
  })

  it("can't delete another user's account", async () => {
    const { app } = setup()

    expect((await request(app).delete(`/api/accounts/${othersId}`).set(auth)).status).toBe(404)
  })
})
