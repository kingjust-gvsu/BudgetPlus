import type { BudgetSettings, BudgetType, Category, CategoryKind } from './api/types'
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

// The budget fields that can have a typing problem
export type BudgetField = 'amount' | 'percent' | 'nextDueDate'

// Problems with what's been typed so far, by field. The API checks the rest.
// otherPercentTotal: what the user's other percent-of-income categories add up to (e.g. 60 for 60%),
// since all of them together can't be more than 100%.
export function budgetErrors(
  kind: CategoryKind,
  values: BudgetFormValues,
  otherPercentTotal = 0,
): Partial<Record<BudgetField, string>> {
  const budgetType = effectiveBudgetType(kind, values)
  const errors: Partial<Record<BudgetField, string>> = {}
  if (budgetType === 'FIXED' && values.amount.trim()) {
    const cents = parseDollars(values.amount)
    if (cents === null || cents < 0) errors.amount = 'Enter an amount like 480 or 480.00.'
  }
  if (budgetType === 'PERCENT_OF_INCOME') {
    const percent = Number(values.percent)
    if (!values.percent.trim() || Number.isNaN(percent)) {
      errors.percent = 'Enter a percent like 12 or 12.5.'
    } else if (percent <= 0 || percent > 100) {
      errors.percent = 'Enter a percent above 0 and up to 100.'
    } else {
      // Whole hundredths, so 33.3 + 66.7 is exactly 100
      const total = Math.round(otherPercentTotal * 100) + Math.round(percent * 100)
      if (total > 10000) errors.percent = `Percent budgets would total ${total / 100}% of income. The most is 100%.`
    }
  }
  if (kind === 'BILL' && values.frequencyMonths > 1 && !values.nextDueDate) {
    errors.nextDueDate = "Enter when this bill is next due, since it isn't monthly."
  }
  return errors
}

// Which budget fields an edit changed, so their errors can start showing
export function changedBudgetFields(before: BudgetFormValues, after: BudgetFormValues): BudgetField[] {
  const changed: BudgetField[] = []
  if (before.amount !== after.amount) changed.push('amount')
  if (before.percent !== after.percent) changed.push('percent')
  if (before.nextDueDate !== after.nextDueDate) changed.push('nextDueDate')
  return changed
}

// The settings to send, with anything that doesn't apply to the kind or budget type cleared.
// Only call once budgetErrors() has no errors.
export function readBudgetValues(kind: CategoryKind, values: BudgetFormValues): BudgetSettings {
  const budgetType = effectiveBudgetType(kind, values)
  const isBill = kind === 'BILL'
  return {
    budgetType,
    budgetCents: budgetType === 'FIXED' && values.amount.trim() ? parseDollars(values.amount) : null,
    budgetPercent: budgetType === 'PERCENT_OF_INCOME' ? Number(values.percent) : null,
    frequencyMonths: isBill ? values.frequencyMonths : 1,
    nextDueDate: isBill && values.frequencyMonths > 1 ? values.nextDueDate || null : null,
  }
}

// What the percent-of-income categories add up to, leaving out one (the one being edited)
export function percentTotal(categories: Category[], exceptId?: string): number {
  const hundredths = categories
    .filter((c) => c.budgetType === 'PERCENT_OF_INCOME' && c.id !== exceptId)
    .reduce((sum, c) => sum + Math.round((c.budgetPercent ?? 0) * 100), 0)
  return hundredths / 100
}
