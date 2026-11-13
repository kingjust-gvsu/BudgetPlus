import { useState, type KeyboardEvent } from 'react'
import type { Category, CategoryChanges, CategoryKind } from '../api/types'
import {
  budgetErrors,
  budgetValuesFrom,
  changedBudgetFields,
  effectiveBudgetType,
  readBudgetValues,
  type BudgetFormValues,
} from '../budgetForm'
import { useLiveErrors } from '../useLiveErrors'
import { BudgetInputs } from './BudgetInputs'
import { PercentSlider } from './PercentSlider'

type Props = {
  category: Category
  // Another category is already the remainder, so this one can't be
  remainderTaken: boolean
  // What the other percent-of-income categories add up to, e.g. 60 for 60%
  otherPercentTotal: number
  onSave: (changes: CategoryChanges) => Promise<void>
  onCancel: () => void
}

// A table row whose cells become inputs, for editing a category and its budget in place.
// Enter saves and Escape cancels. Problems show as you type.
export function EditCategoryRow({ category, remainderTaken, otherPercentTotal, onSave, onCancel }: Props) {
  const [name, setName] = useState(category.name)
  const [kind, setKind] = useState<CategoryKind>(category.kind)
  const [budget, setBudget] = useState(budgetValuesFrom(category))
  const [saving, setSaving] = useState(false)
  const errors = useLiveErrors({
    name: name.trim() ? undefined : 'Enter a name.',
    ...budgetErrors(kind, budget, otherPercentTotal),
  })

  const changeBudget = (next: BudgetFormValues) => {
    errors.touch(...changedBudgetFields(budget, next))
    setBudget(next)
  }

  const save = async () => {
    if (!errors.trySubmit()) return
    setSaving(true)
    try {
      await onSave({ name: name.trim(), kind, ...readBudgetValues(kind, budget) })
    } catch (saveError) {
      errors.setServerError(saveError instanceof Error ? saveError.message : 'Saving failed. Please try again.')
      setSaving(false)
    }
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      save()
    } else if (event.key === 'Escape') {
      onCancel()
    }
  }

  return (
    <>
      <tr className="editing-row" onKeyDown={handleKeyDown}>
        <td>
          <input
            className="cell-input cell-input-grow"
            aria-label={`Name for ${category.name}`}
            maxLength={100}
            autoFocus
            value={name}
            onChange={(e) => {
              errors.touch('name')
              setName(e.target.value)
            }}
          />
        </td>
        <td>
          <select
            className="cell-input"
            aria-label={`Kind for ${category.name}`}
            title={budget.budgetType === 'REMAINDER' ? 'The remainder is always an expense' : undefined}
            disabled={budget.budgetType === 'REMAINDER'}
            value={kind}
            onChange={(e) => {
              errors.touch()
              setKind(e.target.value as CategoryKind)
            }}
          >
            <option value="EXPENSE">Expense</option>
            <option value="BILL">Bill</option>
          </select>
        </td>
        <td>
          <BudgetInputs
            kind={kind}
            values={budget}
            onChange={changeBudget}
            layout="cell"
            labelSuffix={category.name}
            remainderTaken={remainderTaken}
          />
        </td>
        <td className="row-actions">
          <button type="button" className="link-button" disabled={saving} onClick={save}>
            Save
          </button>
          <button type="button" className="link-button" onClick={onCancel}>
            Cancel
          </button>
        </td>
      </tr>
      {effectiveBudgetType(kind, budget) === 'PERCENT_OF_INCOME' && (
        <tr className="editing-row editing-row-extra" onKeyDown={handleKeyDown}>
          <td colSpan={4}>
            <PercentSlider
              otherTotal={otherPercentTotal}
              value={budget.percent}
              onChange={(percent) => changeBudget({ ...budget, percent })}
              label={`Percent of income slider for ${category.name}`}
            />
          </td>
        </tr>
      )}
      {errors.error && (
        <tr>
          <td colSpan={4} className="error" role="alert">
            {errors.error}
          </td>
        </tr>
      )}
    </>
  )
}
