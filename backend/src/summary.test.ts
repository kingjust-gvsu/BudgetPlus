import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { DEFAULT_BUDGET_SETTINGS } from './categories.ts'
import { buildMonthSummary, incomeSummary, type SummaryCategory, type SummaryData } from './summary.ts'
import { createFakeIncomeStore, fakeDependencies, testUser, VALID_TOKEN } from './test/fakes.ts'

function category(id: string, fields: Partial<SummaryCategory> & Pick<SummaryCategory, 'kind'>): SummaryCategory {
  return { id, name: id, ...DEFAULT_BUDGET_SETTINGS, startMonth: '2026-09', ...fields }
}

// The budget from the dashboard mockup, $4,000 a month
const categories = [
  category('rent', { kind: 'BILL', budgetCents: 120000 }),
  category('electric', { kind: 'BILL', budgetCents: 12000 }),
  category('internet', { kind: 'BILL', budgetCents: 6500 }),
  category('phone', { kind: 'BILL', budgetCents: 4500 }),
  category('car-insurance', { kind: 'BILL', budgetCents: 60000, frequencyMonths: 6, nextDueDate: '2027-03-15' }),
  category('groceries', { kind: 'EXPENSE', budgetType: 'PERCENT_OF_INCOME', budgetPercent: 12 }),
  category('gas', { kind: 'EXPENSE', budgetCents: 16000 }),
  category('eating-out', { kind: 'EXPENSE', budgetCents: 20000 }),
  category('savings', { kind: 'EXPENSE', budgetType: 'REMAINDER' }),
]

const october: SummaryData = {
  categories,
  transactions: [
    { categoryId: 'rent', amountCents: 120000 },
    { categoryId: 'electric', amountCents: 13400 },
    { categoryId: 'groceries', amountCents: 31000 },
    { categoryId: 'gas', amountCents: 17200 },
    { categoryId: 'eating-out', amountCents: 14500 },
    { categoryId: null, amountCents: 650 },
  ],
  fundPayments: new Map(),
}

describe('buildMonthSummary', () => {
  const summary = buildMonthSummary('2026-10', 400000, october)
  const find = (id: string) => summary.categories.find((c) => c.id === id)

  it('totals the bills for the month, counting how many monthly bills are paid', () => {
    // Estimates 1200 + 120 + 65 + 45, plus $100 set aside for car insurance
    expect(summary.totals).toMatchObject({
      billsPlannedCents: 153000,
      billsPaidCents: 133400,
      monthlyBillsPaid: 2,
      monthlyBills: 4,
    })
  })

  it('totals expense limits and spending, leaving out the remainder', () => {
    // Limits: 12% of 4000 = 480, plus 160 and 200
    expect(summary.totals).toMatchObject({ expensesLimitCents: 84000, expensesSpentCents: 62700 })
  })

  it('gives the remainder what is left after bills and limits, less the electric overage', () => {
    // 4000 - 1530 - 840 = 1630, then electric came in $14 high
    expect(summary.billDifferenceCents).toBe(1400)
    expect(summary.remainderCents).toBe(161600)
    expect(summary.overPlannedCents).toBe(0)
  })

  it('includes each category with its name, kind, and status', () => {
    expect(find('gas')).toMatchObject({ name: 'gas', kind: 'EXPENSE', type: 'expense', state: 'over', leftCents: -1200 })
    expect(find('electric')).toMatchObject({ kind: 'BILL', type: 'bill', state: 'paid', differenceCents: 1400 })
    expect(find('internet')).toMatchObject({ type: 'bill', state: 'pending' })
    expect(find('savings')).toMatchObject({ budgetType: 'REMAINDER', limitCents: 161600, state: 'under' })
  })

  it('works out the fund for bills that aren\'t monthly', () => {
    expect(find('car-insurance')).toMatchObject({
      type: 'fundBill',
      setAsideCents: 10000,
      targetCents: 60000,
      frequencyMonths: 6,
      fund: { balanceCents: 20000, nextDueDate: '2027-03-15', monthsLeft: 5 },
    })
  })

  it('reports uncategorized spending', () => {
    expect(summary.uncategorizedCents).toBe(650)
  })

  it('settles a fund bill paid this month against the remainder', () => {
    const march = buildMonthSummary('2027-03', 400000, {
      categories,
      transactions: [{ categoryId: 'car-insurance', amountCents: 63000 }],
      fundPayments: new Map([['car-insurance', new Map([['2027-03', 63000]])]]),
    })

    // The full $600 was saved since September; the bill came in at $630
    expect(march.billDifferenceCents).toBe(3000)
    expect(march.categories.find((c) => c.id === 'car-insurance')).toMatchObject({ fund: { paidCents: 63000, remainderChangeCents: -3000 } })
  })

  it('reports how far the budget goes past income', () => {
    // On $2,000: bills 1530 + groceries 240 (12%) + 160 + 200 = 2130, so $130 over
    expect(buildMonthSummary('2026-10', 200000, october).overPlannedCents).toBe(13000)
  })
})

describe('GET /api/summary', () => {
  const auth = { Authorization: `Bearer ${VALID_TOKEN}` }
  const incomeOf400 = createFakeIncomeStore()
  incomeOf400.data.set(testUser.id, {
    sources: [{ id: 'job', name: 'Job', amounts: [{ month: '2026-01', amountCents: 400000 }] }],
    other: new Map(),
  })

  it("returns the signed-in user's summary for the month, using their income", async () => {
    let loaded: { userId: string; month: string } | null = null
    const app = createApp(
      { corsOrigin: 'http://localhost:5173' },
      fakeDependencies({
        income: incomeOf400,
        summary: {
          load: async (userId, month) => {
            loaded = { userId, month }
            return october
          },
        },
      }),
    )

    const response = await request(app).get('/api/summary?month=2026-10').set(auth)

    expect(response.status).toBe(200)
    expect(loaded).toEqual({ userId: testUser.id, month: '2026-10' })
    expect(response.body).toMatchObject({ month: '2026-10', incomeCents: 400000, remainderCents: 161600 })
    expect(response.body.categories).toHaveLength(9)
  })

  it('requires a month', async () => {
    const app = createApp({ corsOrigin: 'http://localhost:5173' }, fakeDependencies())

    const response = await request(app).get('/api/summary').set(auth)

    expect(response.status).toBe(400)
  })

  it('requires sign-in', async () => {
    const app = createApp({ corsOrigin: 'http://localhost:5173' }, fakeDependencies())

    const response = await request(app).get('/api/summary?month=2026-10')

    expect(response.status).toBe(401)
  })
})

describe('incomeSummary', () => {
  const planned = {
    month: '2026-11',
    sources: [{ id: 'vr', name: 'VR', amountCents: 499976, setIn: '2026-01' }],
    otherCents: 0,
    totalCents: 499976,
  }

  it("compares each source's plan with what came in, plus other income", () => {
    const received = new Map([['vr', 253483], ['other', 150000]])

    expect(incomeSummary(planned, [{ id: 'vr', name: 'VR' }], received)).toEqual({
      plannedCents: 499976,
      receivedCents: 403483,
      sources: [{ id: 'vr', name: 'VR', plannedCents: 499976, receivedCents: 253483 }],
      other: { plannedCents: 0, receivedCents: 150000 },
    })
  })

  it("includes a source that isn't planned this month but still paid", () => {
    const sources = [{ id: 'vr', name: 'VR' }, { id: 'buist', name: 'Buist' }]

    const summary = incomeSummary(planned, sources, new Map([['buist', 63036]]))

    expect(summary.sources).toContainEqual({ id: 'buist', name: 'Buist', plannedCents: 0, receivedCents: 63036 })
  })
})
