import { describe, expect, it } from 'vitest'
import { DEFAULT_BUDGET_SETTINGS, type Category } from './categories.ts'
import { fundForMonth } from './fund.ts'
import { monthStatus, type CategoryStatus } from './monthStatus.ts'

function category(id: string, fields: Partial<Category> & Pick<Category, 'kind'>): Category {
  return { id, name: id, ...DEFAULT_BUDGET_SETTINGS, ...fields }
}

// The example from the requirements: $4,000 income, electric estimated at $120,
// and Fun money as the remainder with $300 left after everything else
const rent = category('rent', { kind: 'BILL', budgetCents: 120000 })
const electric = category('electric', { kind: 'BILL', budgetCents: 12000 })
const carInsurance = category('car-insurance', { kind: 'BILL', budgetCents: 60000, frequencyMonths: 6, nextDueDate: '2027-03-15' })
const groceries = category('groceries', { kind: 'EXPENSE', budgetCents: 48000 })
const gas = category('gas', { kind: 'EXPENSE', budgetCents: 16000 })
const eatingOut = category('eating-out', { kind: 'EXPENSE' })
const funMoney = category('fun-money', { kind: 'EXPENSE', budgetType: 'REMAINDER' })
// Planned: 1200 + 120 + 100 + 480 + 160 = 2060, so Fun money gets 4000 - 2060 = 1940; trim to $300 with savings
const savings = category('savings', { kind: 'EXPENSE', budgetCents: 164000 })
const all = [rent, electric, carInsurance, groceries, gas, eatingOut, funMoney, savings]

const statusOf = (statuses: CategoryStatus[], id: string) => statuses.find((s) => s.categoryId === id)
const spend = (categoryId: string | null, amountCents: number) => ({ categoryId, amountCents })

describe('monthStatus', () => {
  it('marks expenses green under their limit and red over it', () => {
    const status = monthStatus(400000, all, [spend('groceries', 31000), spend('gas', 17200)])

    expect(statusOf(status.categories, 'groceries')).toMatchObject({ spentCents: 31000, leftCents: 17000, state: 'under' })
    expect(statusOf(status.categories, 'gas')).toMatchObject({ spentCents: 17200, leftCents: -1200, state: 'over' })
  })

  it('counts spending exactly at the limit as under', () => {
    const status = monthStatus(400000, all, [spend('gas', 16000)])

    expect(statusOf(status.categories, 'gas')).toMatchObject({ leftCents: 0, state: 'under' })
  })

  it("gives an expense with no limit set no color", () => {
    const status = monthStatus(400000, all, [spend('eating-out', 2500)])

    expect(statusOf(status.categories, 'eating-out')).toMatchObject({ limitCents: null, state: 'noLimit' })
  })

  it('shows bills as pending until paid, then compares them to their estimate', () => {
    const status = monthStatus(400000, all, [spend('rent', 120000)])

    expect(statusOf(status.categories, 'rent')).toMatchObject({ state: 'paid', paidCents: 120000, differenceCents: 0 })
    expect(statusOf(status.categories, 'electric')).toMatchObject({ state: 'pending', paidCents: 0, differenceCents: 0 })
  })

  it('takes a bill that came in high out of the remainder, without marking anything red', () => {
    const before = monthStatus(400000, all, [])
    const after = monthStatus(400000, all, [spend('electric', 13400)])

    expect(before.remainderCents).toBe(30000)
    expect(statusOf(after.categories, 'electric')).toMatchObject({ type: 'bill', differenceCents: 1400 })
    expect(after.billDifferenceCents).toBe(1400)
    expect(after.remainderCents).toBe(28600) // $300 - $14 = $286
    expect(statusOf(after.categories, 'fun-money')).toMatchObject({ limitCents: 28600, state: 'under' })
  })

  it('gives the remainder back what a bill came in under its estimate', () => {
    const status = monthStatus(400000, all, [spend('electric', 9500)])

    expect(status.billDifferenceCents).toBe(-2500)
    expect(status.remainderCents).toBe(32500)
  })

  it('adds up several payments to the same bill', () => {
    const status = monthStatus(400000, all, [spend('electric', 6000), spend('electric', 7400)])

    expect(statusOf(status.categories, 'electric')).toMatchObject({ paidCents: 13400, differenceCents: 1400 })
  })

  it('never takes the remainder below zero', () => {
    const status = monthStatus(400000, all, [spend('electric', 60000)])

    expect(status.remainderCents).toBe(0)
  })

  it('counts refunds against spending', () => {
    const status = monthStatus(400000, all, [spend('groceries', 31000), spend('groceries', -1800)])

    expect(statusOf(status.categories, 'groceries')).toMatchObject({ spentCents: 29200 })
  })

  it('leaves bills paid every few months to their fund', () => {
    const status = monthStatus(400000, all, [spend('car-insurance', 60000)])

    expect(statusOf(status.categories, 'car-insurance')).toEqual({ type: 'fundBill', categoryId: 'car-insurance', setAsideCents: 10000 })
    expect(status.billDifferenceCents).toBe(0)
  })

  it("uses the fund's catch-up set-aside and settles a fund payment against the remainder", () => {
    // Car insurance added in January, due in March: $300 a month instead of $100
    const fundBill = { amountCents: 60000, frequencyMonths: 6, nextDueDate: '2027-03-15', startMonth: '2027-01' }
    const january = fundForMonth(fundBill, new Map(), '2027-01')
    const withCatchUp = monthStatus(400000, all, [], new Map([['car-insurance', january]]))

    // $200 more set aside than the even $100, so $200 less for the remainder
    expect(statusOf(withCatchUp.categories, 'car-insurance')).toMatchObject({ setAsideCents: 30000 })
    expect(withCatchUp.remainderCents).toBe(10000)

    // In March the bill comes in at $630 against the $600 saved: $30 comes out of the remainder
    const march = fundForMonth(fundBill, new Map([['2027-03', 63000]]), '2027-03')
    const paid = monthStatus(400000, all, [spend('car-insurance', 63000)], new Map([['car-insurance', march]]))

    expect(paid.billDifferenceCents).toBe(3000)
    expect(paid.remainderCents).toBe(27000) // $300 - $30
  })

  it('totals spending that has no category yet', () => {
    const status = monthStatus(400000, all, [spend(null, 650), spend(null, 1200)])

    expect(status.uncategorizedCents).toBe(1850)
  })

  it('has no remainder amount before income is entered', () => {
    const status = monthStatus(null, all, [spend('electric', 13400)])

    expect(status.remainderCents).toBeNull()
    expect(statusOf(status.categories, 'fun-money')).toMatchObject({ state: 'noLimit' })
  })
})
