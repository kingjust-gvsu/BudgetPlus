import { describe, expect, it } from 'vitest'
import type { Category } from './api/types'
import { describeBudget, formatLongDate } from './budgetText'

const base: Category = {
  id: 'c1',
  name: 'Test',
  kind: 'EXPENSE',
  budgetType: 'FIXED',
  budgetCents: null,
  budgetPercent: null,
  frequencyMonths: 1,
  nextDueDate: null,
}

describe('describeBudget', () => {
  it('describes each kind of budget in plain words', () => {
    expect(describeBudget({ ...base, budgetCents: 48000 })).toBe('$480.00 a month')
    expect(describeBudget({ ...base, budgetType: 'PERCENT_OF_INCOME', budgetPercent: 12.5 })).toBe('12.5% of income')
    expect(describeBudget({ ...base, budgetType: 'REMAINDER' })).toBe('Remainder')
  })

  it('marks bill amounts as estimates and shows how often they are due', () => {
    expect(describeBudget({ ...base, kind: 'BILL', budgetCents: 12000 })).toBe('Est. $120.00 a month')
    expect(describeBudget({ ...base, kind: 'BILL', budgetCents: 60000, frequencyMonths: 6 })).toBe(
      'Est. $600.00 every 6 months',
    )
    expect(describeBudget({ ...base, kind: 'BILL', budgetCents: 12000, frequencyMonths: 12 })).toBe(
      'Est. $120.00 a year',
    )
  })

  it('returns null when no amount is set yet', () => {
    expect(describeBudget(base)).toBeNull()
  })
})

describe('formatLongDate', () => {
  it('spells out the month', () => {
    expect(formatLongDate('2027-03-15')).toBe('March 15, 2027')
  })
})
