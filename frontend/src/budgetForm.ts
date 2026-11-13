import type { BudgetSettings, BudgetType, CategoryKind } from './api/types'
import { centsToInput, parseDollars } from './money'

// What the budget inputs hold while someone is typing (amounts as typed, in dollars)
export type BudgetFormValues = {
  budgetType: BudgetType
  amount: string
  percent: string
  frequencyMonths: number
  nextDueDate: string
}

export const EMPTY_BUDGET_VALUES: BudgetFormValues = {
  budgetType: 'FIXED',
  amount: '',
  percent: '',
  frequencyMonths: 1,
  nextDueDate: '',
}

export function budgetValuesFrom(settings: BudgetSettings): BudgetFormValues {
  return {
    budgetType: settings.budgetType,
    amount: settings.budgetCents === null ? '' : centsToInput(settings.budgetCents),
    percent: settings.budgetPercent === null ? '' : String(settings.budgetPercent),
    frequencyMonths: settings.frequencyMonths,
    nextDueDate: settings.nextDueDate ?? '',
  }
}

// Bills always use a fixed estimate
export function effectiveBudgetType(kind: CategoryKind, values: BudgetFormValues): BudgetType {
  return kind === 'BILL' ? 'FIXED' : values.budgetType
}

// The settings to send, with anything that doesn't apply to the kind or budget type cleared.
// Returns an error message instead when something typed can't be read; the API checks the rest.
export function readBudgetValues(kind: CategoryKind, values: BudgetFormValues): BudgetSettings | string {
  const budgetType = effectiveBudgetType(kind, values)
  const isBill = kind === 'BILL'
  const settings: BudgetSettings = {
    budgetType,
    budgetCents: null,
    budgetPercent: null,
    frequencyMonths: isBill ? values.frequencyMonths : 1,
    nextDueDate: isBill && values.frequencyMonths > 1 ? values.nextDueDate || null : null,
  }
  if (budgetType === 'FIXED' && values.amount.trim()) {
    const cents = parseDollars(values.amount)
    if (cents === null || cents < 0) return 'Enter an amount like 480 or 480.00.'
    settings.budgetCents = cents
  }
  if (budgetType === 'PERCENT_OF_INCOME') {
    const percent = Number(values.percent)
    if (!values.percent.trim() || Number.isNaN(percent)) return 'Enter a percent like 12 or 12.5.'
    settings.budgetPercent = percent
  }
  return settings
}
