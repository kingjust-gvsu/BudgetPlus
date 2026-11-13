import type { Category } from '../api/types'

// A category with the same defaults the API gives a new one, plus whatever the test overrides.
export function makeCategory(fields: Pick<Category, 'id' | 'name' | 'kind'> & Partial<Category>): Category {
  return {
    budgetType: 'FIXED',
    budgetCents: null,
    budgetPercent: null,
    frequencyMonths: 1,
    nextDueDate: null,
    ...fields,
  }
}
