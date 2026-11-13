import { describe, expect, it } from 'vitest'
import { evenSetAside, percentOfIncome, planBudget } from './budget.ts'
import { DEFAULT_BUDGET_SETTINGS, type Category } from './categories.ts'

let nextId = 1
function category(fields: Partial<Category> & Pick<Category, 'name' | 'kind'>): Category {
  return { id: `c${nextId++}`, ...DEFAULT_BUDGET_SETTINGS, ...fields }
}

const rent = category({ name: 'Rent', kind: 'BILL', budgetCents: 120000 })
const electric = category({ name: 'Electric', kind: 'BILL', budgetCents: 12000 })
const carInsurance = category({ name: 'Car insurance', kind: 'BILL', budgetCents: 60000, frequencyMonths: 6, nextDueDate: '2027-03-15' })
const groceries = category({ name: 'Groceries', kind: 'EXPENSE', budgetType: 'PERCENT_OF_INCOME', budgetPercent: 12 })
const gas = category({ name: 'Gas', kind: 'EXPENSE', budgetCents: 16000 })
const savings = category({ name: 'Savings', kind: 'EXPENSE', budgetType: 'REMAINDER' })

const monthly = (plan: ReturnType<typeof planBudget>, c: Category) =>
  plan.lines.find((line) => line.categoryId === c.id)?.monthlyCents

describe('planBudget', () => {
  it('works out each kind of budget for the month', () => {
    const plan = planBudget(400000, [rent, electric, carInsurance, groceries, gas, savings])

    expect(monthly(plan, rent)).toBe(120000) // fixed bill estimate
    expect(monthly(plan, carInsurance)).toBe(10000) // $600 every 6 months = $100 a month
    expect(monthly(plan, groceries)).toBe(48000) // 12% of $4,000
    expect(monthly(plan, gas)).toBe(16000) // fixed expense
    // $4,000 - ($1,200 + $120 + $100 + $480 + $160) = $1,940
    expect(monthly(plan, savings)).toBe(194000)
    expect(plan.plannedCents).toBe(206000)
    expect(plan.remainderCents).toBe(194000)
    expect(plan.overPlannedCents).toBe(0)
  })

  it('keeps the lines in the same order as the categories', () => {
    const plan = planBudget(400000, [savings, rent, groceries])

    expect(plan.lines.map((line) => line.categoryId)).toEqual([savings.id, rent.id, groceries.id])
  })

  it('reports how far the budget goes past income, and gives the remainder nothing', () => {
    const plan = planBudget(130000, [rent, electric, gas, savings])

    // $1,200 + $120 + $160 = $1,480 against $1,300 of income
    expect(plan.overPlannedCents).toBe(18000)
    expect(monthly(plan, savings)).toBe(0)
  })

  it("can't work out percents or the remainder before income is entered", () => {
    const plan = planBudget(null, [rent, groceries, savings])

    expect(monthly(plan, rent)).toBe(120000)
    expect(monthly(plan, groceries)).toBeNull()
    expect(monthly(plan, savings)).toBeNull()
    expect(plan.overPlannedCents).toBe(0)
  })

  it('flags amounts that have not been entered and counts them as zero', () => {
    const unset = category({ name: 'Internet', kind: 'BILL' })

    const plan = planBudget(400000, [unset, savings])

    expect(plan.lines[0]).toEqual({ categoryId: unset.id, monthlyCents: null, notSet: true })
    expect(monthly(plan, savings)).toBe(400000)
  })

  it('has no remainder amount when no category is the remainder', () => {
    const plan = planBudget(400000, [rent, gas])

    expect(plan.remainderCents).toBeNull()
    expect(plan.overPlannedCents).toBe(0)
  })

  it('handles no categories at all', () => {
    expect(planBudget(400000, [])).toEqual({ lines: [], plannedCents: 0, remainderCents: null, overPlannedCents: 0 })
  })
})

describe('percentOfIncome', () => {
  it('rounds to the nearest cent', () => {
    expect(percentOfIncome(400000, 12.5)).toBe(50000)
    expect(percentOfIncome(333333, 10)).toBe(33333) // $333.333 → $333.33
    expect(percentOfIncome(333335, 10)).toBe(33334) // $333.335 → $333.34
  })

  it('stays exact for percents that are awkward as decimals', () => {
    // 0.1 + 0.2 style floating point problems don't leak into cents
    expect(percentOfIncome(100000, 0.3)).toBe(300)
    expect(percentOfIncome(100000, 33.33)).toBe(33330)
  })
})

describe('evenSetAside', () => {
  it('spreads a bill evenly over the months between payments', () => {
    expect(evenSetAside(60000, 6)).toBe(10000)
  })

  it('rounds up so the set-asides cover the whole bill', () => {
    // $100 every 3 months: $33.34 x 3 = $100.02, never short
    expect(evenSetAside(10000, 3)).toBe(3334)
    expect(evenSetAside(10000, 3) * 3).toBeGreaterThanOrEqual(10000)
  })
})
