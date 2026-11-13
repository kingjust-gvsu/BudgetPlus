import { describe, expect, it } from 'vitest'
import { DEFAULT_BUDGET_SETTINGS, resolveBudgetSettings, type BudgetSettings } from './categories.ts'

const defaults = DEFAULT_BUDGET_SETTINGS

describe('resolveBudgetSettings', () => {
  describe('bills', () => {
    it('take a fixed estimate', () => {
      expect(resolveBudgetSettings('BILL', defaults, { budgetCents: 12000 })).toEqual({ ...defaults, budgetCents: 12000 })
    })

    it('can be due every few months with a next due date', () => {
      const settings = resolveBudgetSettings('BILL', defaults, {
        budgetCents: 60000,
        frequencyMonths: 6,
        nextDueDate: '2027-03-15',
      })

      expect(settings).toMatchObject({ budgetCents: 60000, frequencyMonths: 6, nextDueDate: '2027-03-15' })
    })

    it('need a due date when they are not monthly', () => {
      expect(() => resolveBudgetSettings('BILL', defaults, { frequencyMonths: 6 })).toThrow(/next due/)
    })

    it("can't use a percent or the remainder", () => {
      expect(() => resolveBudgetSettings('BILL', defaults, { budgetType: 'PERCENT_OF_INCOME' })).toThrow(
        'Bills use a fixed estimate',
      )
      expect(() => resolveBudgetSettings('BILL', defaults, { budgetType: 'REMAINDER' })).toThrow(
        'Bills use a fixed estimate',
      )
    })

    it('switch to a fixed budget when an expense with a percent becomes a bill', () => {
      const expense: BudgetSettings = { ...defaults, budgetType: 'PERCENT_OF_INCOME', budgetPercent: 12 }

      expect(resolveBudgetSettings('BILL', expense, {})).toEqual(defaults)
    })
  })

  describe('expenses', () => {
    it('take a percent of income', () => {
      const settings = resolveBudgetSettings('EXPENSE', defaults, { budgetType: 'PERCENT_OF_INCOME', budgetPercent: 12.5 })

      expect(settings).toMatchObject({ budgetType: 'PERCENT_OF_INCOME', budgetPercent: 12.5, budgetCents: null })
    })

    it('need a percent when the budget is a percent of income', () => {
      expect(() => resolveBudgetSettings('EXPENSE', defaults, { budgetType: 'PERCENT_OF_INCOME' })).toThrow(
        'Enter a percent of income',
      )
    })

    it('drop the old amount when switching from fixed to a percent', () => {
      const fixed: BudgetSettings = { ...defaults, budgetCents: 48000 }

      const settings = resolveBudgetSettings('EXPENSE', fixed, { budgetType: 'PERCENT_OF_INCOME', budgetPercent: 12 })

      expect(settings.budgetCents).toBeNull()
    })

    it('reject an amount sent along with the remainder', () => {
      expect(() => resolveBudgetSettings('EXPENSE', defaults, { budgetType: 'REMAINDER', budgetCents: 100 })).toThrow(
        /no amount or percent/,
      )
    })

    it("can't have a frequency or due date", () => {
      expect(() => resolveBudgetSettings('EXPENSE', defaults, { frequencyMonths: 3 })).toThrow(
        'Only bills can have a frequency or due date',
      )
    })

    it('become monthly when a non-monthly bill becomes an expense', () => {
      const bill: BudgetSettings = { ...defaults, budgetCents: 60000, frequencyMonths: 6, nextDueDate: '2027-03-15' }

      expect(resolveBudgetSettings('EXPENSE', bill, {})).toEqual({ ...defaults, budgetCents: 60000 })
    })
  })
})
