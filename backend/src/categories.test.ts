import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { DEFAULT_BUDGET_SETTINGS } from './categories.ts'
import { createFakeCategoryStore, fakeDependencies, OTHER_USER_TOKEN, otherUser, testUser, VALID_TOKEN } from './test/fakes.ts'

const config = { corsOrigin: 'http://localhost:5173' }
const auth = { Authorization: `Bearer ${VALID_TOKEN}` }
const otherAuth = { Authorization: `Bearer ${OTHER_USER_TOKEN}` }

const groceriesId = '10000000-0000-0000-0000-000000000001'
const rentId = '10000000-0000-0000-0000-000000000002'
const othersId = '10000000-0000-0000-0000-000000000003'

function setup() {
  const store = createFakeCategoryStore([
    { id: groceriesId, userId: testUser.id, name: 'Groceries', kind: 'EXPENSE' },
    { id: rentId, userId: testUser.id, name: 'Rent', kind: 'BILL' },
    { id: othersId, userId: otherUser.id, name: 'Gas', kind: 'EXPENSE' },
  ])
  return { app: createApp(config, fakeDependencies({ categories: store })), store }
}

describe('GET /api/categories', () => {
  it("lists only the signed-in user's categories, sorted by name", async () => {
    const { app } = setup()

    const response = await request(app).get('/api/categories').set(auth)

    expect(response.status).toBe(200)
    expect(response.body).toEqual([
      { id: groceriesId, name: 'Groceries', kind: 'EXPENSE', ...DEFAULT_BUDGET_SETTINGS },
      { id: rentId, name: 'Rent', kind: 'BILL', ...DEFAULT_BUDGET_SETTINGS },
    ])
  })

  it('requires sign-in', async () => {
    const { app } = setup()

    const response = await request(app).get('/api/categories')

    expect(response.status).toBe(401)
  })
})

describe('POST /api/categories', () => {
  it('creates a category', async () => {
    const { app, store } = setup()

    const response = await request(app).post('/api/categories').set(auth).send({ name: '  Electric ', kind: 'BILL' })

    expect(response.status).toBe(201)
    expect(response.body).toEqual({ id: expect.any(String), name: 'Electric', kind: 'BILL', ...DEFAULT_BUDGET_SETTINGS })
    expect(store.rows).toContainEqual({ ...response.body, userId: testUser.id })
  })

  it('rejects a missing name', async () => {
    const { app } = setup()

    const response = await request(app).post('/api/categories').set(auth).send({ name: '  ', kind: 'BILL' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'Name is required' })
  })

  it('rejects an unknown kind', async () => {
    const { app } = setup()

    const response = await request(app).post('/api/categories').set(auth).send({ name: 'Fun', kind: 'FUN' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'Kind must be one of: BILL, EXPENSE' })
  })

  it('rejects a name the user already uses', async () => {
    const { app } = setup()

    const response = await request(app).post('/api/categories').set(auth).send({ name: 'Rent', kind: 'BILL' })

    expect(response.status).toBe(409)
  })

  it("allows a name another user already uses", async () => {
    const { app } = setup()

    const response = await request(app).post('/api/categories').set(auth).send({ name: 'Gas', kind: 'EXPENSE' })

    expect(response.status).toBe(201)
  })
})

describe('PATCH /api/categories/:id', () => {
  it('renames a category and changes its kind', async () => {
    const { app } = setup()

    const response = await request(app)
      .patch(`/api/categories/${groceriesId}`)
      .set(auth)
      .send({ name: 'Food', kind: 'BILL' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ id: groceriesId, name: 'Food', kind: 'BILL', ...DEFAULT_BUDGET_SETTINGS })
  })

  it('rejects an empty change', async () => {
    const { app } = setup()

    const response = await request(app).patch(`/api/categories/${groceriesId}`).set(auth).send({})

    expect(response.status).toBe(400)
  })

  it('rejects renaming to a name the user already uses', async () => {
    const { app } = setup()

    const response = await request(app).patch(`/api/categories/${groceriesId}`).set(auth).send({ name: 'Rent' })

    expect(response.status).toBe(409)
  })

  it("can't change another user's category", async () => {
    const { app, store } = setup()

    const response = await request(app).patch(`/api/categories/${groceriesId}`).set(otherAuth).send({ name: 'Mine' })

    expect(response.status).toBe(404)
    expect(store.rows.find((r) => r.id === groceriesId)?.name).toBe('Groceries')
  })

  it('returns 404 for an id that is not a valid id', async () => {
    const { app } = setup()

    const response = await request(app).patch('/api/categories/not-an-id').set(auth).send({ name: 'x' })

    expect(response.status).toBe(404)
  })
})

describe('budget settings', () => {
  it('creates a non-monthly bill with its schedule', async () => {
    const { app } = setup()

    const response = await request(app)
      .post('/api/categories')
      .set(auth)
      .send({ name: 'Car insurance', kind: 'BILL', budgetCents: 60000, frequencyMonths: 6, nextDueDate: '2027-03-15' })

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({ budgetType: 'FIXED', budgetCents: 60000, frequencyMonths: 6, nextDueDate: '2027-03-15' })
  })

  it('sets an expense to a percent of income', async () => {
    const { app } = setup()

    const response = await request(app)
      .patch(`/api/categories/${groceriesId}`)
      .set(auth)
      .send({ budgetType: 'PERCENT_OF_INCOME', budgetPercent: 12 })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ budgetType: 'PERCENT_OF_INCOME', budgetPercent: 12, budgetCents: null })
  })

  it('allows only one remainder category', async () => {
    const { app } = setup()
    await request(app).patch(`/api/categories/${groceriesId}`).set(auth).send({ budgetType: 'REMAINDER' })

    const response = await request(app)
      .post('/api/categories')
      .set(auth)
      .send({ name: 'Savings', kind: 'EXPENSE', budgetType: 'REMAINDER' })

    expect(response.status).toBe(409)
    expect(response.body).toEqual({ error: 'Only one category can be the remainder' })
  })

  it("doesn't let percent budgets total more than 100%", async () => {
    const { app } = setup()
    await request(app).patch(`/api/categories/${groceriesId}`).set(auth).send({ budgetType: 'PERCENT_OF_INCOME', budgetPercent: 60 })

    const tooMuch = await request(app)
      .post('/api/categories')
      .set(auth)
      .send({ name: 'Savings', kind: 'EXPENSE', budgetType: 'PERCENT_OF_INCOME', budgetPercent: 45 })
    const exactly100 = await request(app)
      .post('/api/categories')
      .set(auth)
      .send({ name: 'Savings', kind: 'EXPENSE', budgetType: 'PERCENT_OF_INCOME', budgetPercent: 40 })

    expect(tooMuch.status).toBe(409)
    expect(tooMuch.body).toEqual({ error: 'Percent budgets would total 105% of income. The most is 100%.' })
    expect(exactly100.status).toBe(201)
  })

  it("counts a category's own old percent only once when it's edited", async () => {
    const { app } = setup()
    await request(app).patch(`/api/categories/${groceriesId}`).set(auth).send({ budgetType: 'PERCENT_OF_INCOME', budgetPercent: 60 })

    const response = await request(app).patch(`/api/categories/${groceriesId}`).set(auth).send({ budgetPercent: 90 })

    expect(response.status).toBe(200)
  })

  it.each([
    ['a negative amount', { budgetCents: -100 }, 'Budget amount must be a whole number of cents, zero or more'],
    ['a percent over 100', { budgetType: 'PERCENT_OF_INCOME', budgetPercent: 150 }, 'Budget percent must be a percent above 0 and up to 100'],
    ['a percent with three decimals', { budgetType: 'PERCENT_OF_INCOME', budgetPercent: 12.345 }, 'Budget percent can have at most two decimal places'],
    ['an unknown budget type', { budgetType: 'WEEKLY' }, 'Budget type must be one of: FIXED, PERCENT_OF_INCOME, REMAINDER'],
  ])('rejects %s', async (_case, change, error) => {
    const { app } = setup()

    const response = await request(app).patch(`/api/categories/${groceriesId}`).set(auth).send(change)

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error })
  })
})

describe('DELETE /api/categories/:id', () => {
  it('deletes a category', async () => {
    const { app, store } = setup()

    const response = await request(app).delete(`/api/categories/${rentId}`).set(auth)

    expect(response.status).toBe(204)
    expect(store.rows.some((r) => r.id === rentId)).toBe(false)
  })

  it("can't delete another user's category", async () => {
    const { app, store } = setup()

    const response = await request(app).delete(`/api/categories/${othersId}`).set(auth)

    expect(response.status).toBe(404)
    expect(store.rows.some((r) => r.id === othersId)).toBe(true)
  })
})
