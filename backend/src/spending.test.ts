import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { monthsEnding, spendingSummary } from './spending.ts'
import {
  createFakeCategoryStore,
  createFakeIncomeStore,
  createFakeTransactionStore,
  fakeDependencies,
  otherUser,
  testUser,
  VALID_TOKEN,
} from './test/fakes.ts'

const rent = { id: '10000000-0000-0000-0000-000000000001', name: 'Rent', kind: 'BILL' as const }
const groceries = { id: '10000000-0000-0000-0000-000000000002', name: 'Groceries', kind: 'EXPENSE' as const }

describe('monthsEnding', () => {
  it('counts back across a year boundary, oldest first', () => {
    expect(monthsEnding('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02'])
  })
})

describe('spendingSummary', () => {
  const transactions = [
    { date: '2026-10-01', amountCents: 120000, categoryId: rent.id },
    { date: '2026-10-15', amountCents: 8412, categoryId: groceries.id },
    { date: '2026-11-01', amountCents: 120000, categoryId: rent.id },
    { date: '2026-11-03', amountCents: 9000, categoryId: groceries.id },
    { date: '2026-11-04', amountCents: -1500, categoryId: groceries.id }, // a refund
    { date: '2026-11-05', amountCents: 650, categoryId: null },
    { date: '2026-08-20', amountCents: 99999, categoryId: groceries.id }, // too early
  ]

  it('adds up bills and expenses for each month, with uncategorized counted as expenses', () => {
    const { months } = spendingSummary(['2026-09', '2026-10', '2026-11'], [rent, groceries], transactions)

    expect(months).toEqual([
      { month: '2026-09', billsCents: 0, expensesCents: 0 },
      { month: '2026-10', billsCents: 120000, expensesCents: 8412 },
      { month: '2026-11', billsCents: 120000, expensesCents: 9000 - 1500 + 650 },
    ])
  })

  it('totals each category over the months and month by month, largest first', () => {
    const { categories } = spendingSummary(['2026-10', '2026-11'], [rent, groceries], transactions)

    expect(categories).toEqual([
      { id: rent.id, name: 'Rent', kind: 'BILL', spentCents: 240000, byMonthCents: [120000, 120000] },
      { id: groceries.id, name: 'Groceries', kind: 'EXPENSE', spentCents: 8412 + 9000 - 1500, byMonthCents: [8412, 7500] },
      { id: null, name: 'Uncategorized', kind: null, spentCents: 650, byMonthCents: [0, 650] },
    ])
  })

  it('leaves out categories with nothing spent', () => {
    expect(spendingSummary(['2026-09'], [rent, groceries], transactions).categories).toEqual([])
  })
})

describe('GET /api/spending', () => {
  const auth = { Authorization: `Bearer ${VALID_TOKEN}` }

  function setup() {
    const categoryRows = [
      { ...rent, userId: testUser.id },
      { ...groceries, userId: testUser.id },
    ]
    const transactions = createFakeTransactionStore(
      [
        { id: 't1', userId: testUser.id, date: '2026-11-01', description: 'Landlord', amountCents: 120000, categoryId: rent.id },
        { id: 't2', userId: testUser.id, date: '2026-10-15', description: 'Meijer', amountCents: 8412, categoryId: groceries.id },
        { id: 't3', userId: otherUser.id, date: '2026-11-02', description: 'Not mine', amountCents: 500, categoryId: null },
      ],
      categoryRows,
    )
    // A raise in November
    const income = createFakeIncomeStore()
    income.data.set(testUser.id, {
      sources: [{ id: 'job', name: 'Job', amounts: [{ month: '2026-01', amountCents: 400000 }, { month: '2026-11', amountCents: 450000 }] }],
      other: new Map(),
    })
    return createApp(
      { corsOrigin: 'http://localhost:5173' },
      fakeDependencies({ categories: createFakeCategoryStore(categoryRows), transactions, income }),
    )
  }

  it("summarizes the user's spending and income for the months asked for", async () => {
    const response = await request(setup()).get('/api/spending?to=2026-11&months=2').set(auth)

    expect(response.status).toBe(200)
    expect(response.body.months).toEqual([
      { month: '2026-10', billsCents: 0, expensesCents: 8412, incomeCents: 400000 },
      { month: '2026-11', billsCents: 120000, expensesCents: 0, incomeCents: 450000 },
    ])
    expect(response.body.categories.map((c: { name: string }) => c.name)).toEqual(['Rent', 'Groceries'])
  })

  it('goes back to the first transaction for months=all', async () => {
    const response = await request(setup()).get('/api/spending?to=2026-11&months=all').set(auth)

    expect(response.body.months.map((m: { month: string }) => m.month)).toEqual(['2026-10', '2026-11'])
  })

  it.each([
    ['a missing month', '/api/spending', 'to must be a month like 2026-10'],
    ['too many months', '/api/spending?to=2026-11&months=36', 'months must be a whole number from 1 to 24, or all'],
    ['a fractional count', '/api/spending?to=2026-11&months=2.5', 'months must be a whole number from 1 to 24, or all'],
  ])('rejects %s', async (_case, url, error) => {
    const response = await request(setup()).get(url).set(auth)

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error })
  })

  it('requires sign-in', async () => {
    const response = await request(setup()).get('/api/spending?to=2026-11')

    expect(response.status).toBe(401)
  })
})
