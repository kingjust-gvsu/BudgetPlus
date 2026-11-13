import { useState, type KeyboardEvent } from 'react'
import type { Category, CategoryChanges, CategoryKind } from '../api/types'
import { budgetValuesFrom, readBudgetValues } from '../budgetForm'
import { BudgetInputs } from './BudgetInputs'

type Props = {
  category: Category
  // Another category is already the remainder, so this one can't be
  remainderTaken: boolean
  onSave: (changes: CategoryChanges) => Promise<void>
  onCancel: () => void
}

// A table row whose cells become inputs, for editing a category and its budget in place.
// Enter saves and Escape cancels.
export function EditCategoryRow({ category, remainderTaken, onSave, onCancel }: Props) {
  const [name, setName] = useState(category.name)
  const [kind, setKind] = useState<CategoryKind>(category.kind)
  const [budget, setBudget] = useState(budgetValuesFrom(category))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim()) {
      setError('Enter a name.')
      return
    }
    const settings = readBudgetValues(kind, budget)
    if (typeof settings === 'string') {
      setError(settings)
      return
    }
    setError(null)
    setSaving(true)
    try {
      await onSave({ name: name.trim(), kind, ...settings })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Saving failed. Please try again.')
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
            onChange={(e) => setName(e.target.value)}
          />
        </td>
        <td>
          <select
            className="cell-input"
            aria-label={`Kind for ${category.name}`}
            title={budget.budgetType === 'REMAINDER' ? 'The remainder is always an expense' : undefined}
            disabled={budget.budgetType === 'REMAINDER'}
            value={kind}
            onChange={(e) => setKind(e.target.value as CategoryKind)}
          >
            <option value="EXPENSE">Expense</option>
            <option value="BILL">Bill</option>
          </select>
        </td>
        <td>
          <BudgetInputs
            kind={kind}
            values={budget}
            onChange={setBudget}
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
      {error && (
        <tr>
          <td colSpan={4} className="error" role="alert">
            {error}
          </td>
        </tr>
      )}
    </>
  )
}
