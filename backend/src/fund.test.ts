import { describe, expect, it } from 'vitest'
import { fundForMonth, monthsBetween, upcomingDueDate, type FundBill } from './fund.ts'

// Car insurance: $600 every 6 months, due March 15
const carInsurance = (startMonth: string): FundBill => ({
  amountCents: 60000,
  frequencyMonths: 6,
  nextDueDate: '2027-03-15',
  startMonth,
})

const noPayments = new Map<string, number>()

describe('fundForMonth', () => {
  it('saves the same amount each month across a full cycle', () => {
    const bill = carInsurance('2026-09')

    expect(fundForMonth(bill, noPayments, '2026-09')).toMatchObject({ setAsideCents: 10000, balanceCents: 10000, monthsLeft: 6 })
    expect(fundForMonth(bill, noPayments, '2027-02')).toMatchObject({ setAsideCents: 10000, balanceCents: 60000, monthsLeft: 1 })
  })

  it('catches up when saving starts with less than a full cycle left', () => {
    // Added in January, due in March: $600 over 2 months
    const bill = carInsurance('2027-01')

    expect(fundForMonth(bill, noPayments, '2027-01')).toMatchObject({ setAsideCents: 30000, monthsLeft: 2 })
    expect(fundForMonth(bill, noPayments, '2027-02')).toMatchObject({ setAsideCents: 30000, balanceCents: 60000 })
  })

  it('pays the bill from the fund, then saves normally for the next due date', () => {
    const bill = carInsurance('2027-01')
    const payments = new Map([['2027-03', 60000]])

    const march = fundForMonth(bill, payments, '2027-03')

    // The full $600 was saved, so the month's budget isn't touched
    expect(march).toMatchObject({ paidCents: 60000, remainderChangeCents: 0 })
    // March already saves toward September, at the normal $100
    expect(march).toMatchObject({ nextDueDate: '2027-09-15', setAsideCents: 10000, balanceCents: 10000, monthsLeft: 6 })
  })

  it('takes a bill that came in higher than saved out of the remainder', () => {
    const payments = new Map([['2027-03', 63000]])

    expect(fundForMonth(carInsurance('2027-01'), payments, '2027-03').remainderChangeCents).toBe(-3000)
  })

  it('gives the remainder what a lower bill leaves in the fund', () => {
    const payments = new Map([['2027-03', 57500]])

    expect(fundForMonth(carInsurance('2027-01'), payments, '2027-03').remainderChangeCents).toBe(2500)
  })

  it('takes the shortfall from the remainder when there was no time to save', () => {
    // Added in the month it's due: nothing saved yet
    const payments = new Map([['2027-03', 60000]])

    expect(fundForMonth(carInsurance('2027-03'), payments, '2027-03').remainderChangeCents).toBe(-60000)
  })

  it('adds up to exactly the bill even when it doesn\'t divide evenly', () => {
    // $100 every 3 months: 33.34 + 33.33 + 33.33
    const bill: FundBill = { amountCents: 10000, frequencyMonths: 3, nextDueDate: '2027-04-10', startMonth: '2027-01' }

    const setAsides = ['2027-01', '2027-02', '2027-03'].map((m) => fundForMonth(bill, noPayments, m).setAsideCents)

    expect(setAsides).toEqual([3334, 3333, 3333])
    expect(fundForMonth(bill, noPayments, '2027-03').balanceCents).toBe(10000)
  })

  it('keeps rolling due dates forward after the stored one passes', () => {
    const bill = carInsurance('2026-09')
    const payments = new Map([
      ['2027-03', 60000],
      ['2027-09', 60000],
    ])

    // September's set-aside already went toward March 2028, so October makes it $200
    expect(fundForMonth(bill, payments, '2027-10')).toMatchObject({ nextDueDate: '2028-03-15', balanceCents: 20000 })
  })

  it('is empty before saving starts', () => {
    expect(fundForMonth(carInsurance('2027-01'), noPayments, '2026-12')).toMatchObject({ setAsideCents: 0, balanceCents: 0 })
  })

  it('handles a yearly bill', () => {
    const registration: FundBill = { amountCents: 12000, frequencyMonths: 12, nextDueDate: '2027-06-01', startMonth: '2026-06' }

    expect(fundForMonth(registration, noPayments, '2026-06')).toMatchObject({ setAsideCents: 1000, monthsLeft: 12 })
  })
})

describe('upcomingDueDate', () => {
  const bill = { frequencyMonths: 6, nextDueDate: '2027-03-15' }

  it('finds the next due date after a month, in either direction from the stored one', () => {
    expect(upcomingDueDate(bill, '2027-02')).toBe('2027-03-15')
    expect(upcomingDueDate(bill, '2027-03')).toBe('2027-09-15') // the due month saves for the next one
    expect(upcomingDueDate(bill, '2026-08')).toBe('2026-09-15') // before the stored date
    expect(upcomingDueDate(bill, '2028-01')).toBe('2028-03-15')
  })
})

describe('monthsBetween', () => {
  it('counts months, across years', () => {
    expect(monthsBetween('2027-01', '2027-03')).toBe(2)
    expect(monthsBetween('2026-11', '2027-02')).toBe(3)
  })
})
