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
  const spent = (date: string, amountCents: number, accountId = 'checking') => ({ date, amountCents, accountId, transferAccountId: null })

  it('starts from the starting balance and counts transactions from the start date on', () => {
    const account = { id: 'checking', startingBalanceCents: 10000, startDate: '2026-10-01' }

    expect(balanceOf(account, [
      spent('2026-09-30', 5000), // before the start date
      spent('2026-10-01', 3000), // spent
      spent('2026-10-09', -500), // money back
      spent('2026-10-09', 7000, 'card'), // another account's
    ])).toBe(10000 - 3000 + 500)
  })

  it("makes spending on a credit card add to what's owed", () => {
    const card = { id: 'card', startingBalanceCents: -20000, startDate: '2026-10-01' }

    expect(balanceOf(card, [spent('2026-10-06', 4000, 'card')])).toBe(-24000)
  })

  it('moves a transfer out of one account and into the other', () => {
    const payoff = { date: '2026-10-08', amountCents: 24000, accountId: 'checking', transferAccountId: 'card' }

    expect(balanceOf({ id: 'checking', startingBalanceCents: 100000, startDate: '2026-10-01' }, [payoff])).toBe(76000)
    expect(balanceOf({ id: 'card', startingBalanceCents: -24000, startDate: '2026-10-01' }, [payoff])).toBe(0)
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
      { id: checkingId, name: 'Checking', type: 'BANK', startingBalanceCents: 500000, startDate: '2026-10-01', closed: false, parentAccountId: null, balanceCents: 500000 - 120000 + 2500 },
      { id: cardId, name: 'Amazon Card', type: 'CREDIT_CARD', startingBalanceCents: -20000, startDate: '2026-10-01', closed: false, parentAccountId: null, balanceCents: -24000 },
      { id: fundId, name: 'Car insurance fund', type: 'FUND', startingBalanceCents: 94800, startDate: '2026-10-01', closed: false, parentAccountId: null, balanceCents: 94800 },
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
    expect(response.body).toEqual({ id: expect.any(String), ...newAccount, closed: false, parentAccountId: null, balanceCents: 0 })
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

  it('closes an account and reopens it', async () => {
    const { app } = setup()

    const closed = await request(app).patch(`/api/accounts/${fundId}`).set(auth).send({ closed: true })
    const reopened = await request(app).patch(`/api/accounts/${fundId}`).set(auth).send({ closed: false })

    expect(closed.body.closed).toBe(true)
    expect(reopened.body.closed).toBe(false)
  })

  it('rejects a closed value that is not true or false', async () => {
    const { app } = setup()

    const response = await request(app).patch(`/api/accounts/${fundId}`).set(auth).send({ closed: 'yes' })

    expect(response.body.error).toBe('Closed must be true or false')
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
    expect(response.body.error).toBe('This account has transactions or transfers. Move or delete them first.')
    expect(store.rows.some((a) => a.id === checkingId)).toBe(true)
  })

  it("won't delete an account that money was transferred into", async () => {
    const { app } = setup()
    await request(app).post('/api/transactions').set(auth).send({ date: '2026-10-10', description: 'Save', amountCents: 5000, accountId: checkingId, transferAccountId: fundId })

    const response = await request(app).delete(`/api/accounts/${fundId}`).set(auth)
    const fund = (await request(app).get('/api/accounts').set(auth)).body.find((a: { id: string }) => a.id === fundId)

    expect(response.status).toBe(409)
    expect(fund.balanceCents).toBe(94800 + 5000)
  })

  it("can't delete another user's account", async () => {
    const { app } = setup()

    expect((await request(app).delete(`/api/accounts/${othersId}`).set(auth)).status).toBe(404)
  })
})

describe('buckets in a bank account', () => {
  const put = (app: ReturnType<typeof setup>['app'], id: string, parentAccountId: string | null) =>
    request(app).patch(`/api/accounts/${id}`).set(auth).send({ parentAccountId })

  it('puts a bucket in a bank account and takes it back out', async () => {
    const { app } = setup()

    const moved = await put(app, fundId, checkingId)
    expect(moved.status).toBe(200)
    expect(moved.body.parentAccountId).toBe(checkingId)

    const out = await put(app, fundId, null)
    expect(out.body.parentAccountId).toBeNull()
  })

  it('adds a bucket straight into a bank account', async () => {
    const { app } = setup()

    const response = await request(app)
      .post('/api/accounts')
      .set(auth)
      .send({ name: 'Fun money', type: 'FUND', startingBalanceCents: 0, startDate: '2026-11-01', parentAccountId: checkingId })

    expect(response.status).toBe(201)
    expect(response.body.parentAccountId).toBe(checkingId)
  })

  it.each([
    ['a bank account in another account', checkingId, fundId, 'Only a bucket can go in another account'],
    ['a bucket in a credit card', fundId, cardId, 'A bucket can only go in a bank account'],
    ["a bucket in another user's account", fundId, othersId, 'Account not found'],
  ])('rejects %s', async (_case, id, parentAccountId, message) => {
    const { app } = setup()

    const response = await put(app, id, parentAccountId)

    expect(response.status).toBe(400)
    expect(response.body.error).toBe(message)
  })

  it("won't change or delete a bank account that has buckets in it", async () => {
    const { app } = setup()
    await put(app, fundId, checkingId)

    const changed = await request(app).patch(`/api/accounts/${checkingId}`).set(auth).send({ type: 'CREDIT_CARD' })
    expect(changed.status).toBe(409)
    expect(changed.body.error).toBe('This account has buckets in it. Move or delete them first.')
    expect((await request(app).delete(`/api/accounts/${checkingId}`).set(auth)).status).toBe(409)
  })

  it('takes a bucket out of its bank account when it becomes another type', async () => {
    const { app } = setup()
    await put(app, fundId, checkingId)

    const response = await request(app).patch(`/api/accounts/${fundId}`).set(auth).send({ type: 'BANK' })

    expect(response.body.parentAccountId).toBeNull()
  })
})
