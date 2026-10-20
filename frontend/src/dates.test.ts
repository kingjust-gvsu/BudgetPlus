import { describe, expect, it } from 'vitest'
import { formatDay, formatMonth, shiftMonth, today } from './dates'

describe('dates', () => {
  it("gives today's date in local time", () => {
    expect(today(new Date(2026, 9, 5, 23, 30))).toBe('2026-10-05')
  })

  it('moves between months, across years', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-10', 0)).toBe('2026-10')
  })

  it('formats months and days for display', () => {
    expect(formatMonth('2026-10')).toBe('October 2026')
    expect(formatDay('2026-10-05')).toBe('Oct 5')
  })
})
