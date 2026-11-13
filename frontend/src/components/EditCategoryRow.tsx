import { useState, type KeyboardEvent } from 'react'
import type { Category, CategoryKind } from '../api/types'

type Props = {
  category: Category
  onSave: (changes: { name: string; kind: CategoryKind }) => Promise<void>
  onCancel: () => void
}

// A table row whose cells become inputs, for renaming a category or changing its kind in place.
// Enter saves and Escape cancels.
export function EditCategoryRow({ category, onSave, onCancel }: Props) {
  const [name, setName] = useState(category.name)
  const [kind, setKind] = useState<CategoryKind>(category.kind)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim()) {
      setError('Enter a name.')
      return
    }
    setError(null)
    setSaving(true)
    try {
      await onSave({ name: name.trim(), kind })
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
            value={kind}
            onChange={(e) => setKind(e.target.value as CategoryKind)}
          >
            <option value="EXPENSE">Expense</option>
            <option value="BILL">Bill</option>
          </select>
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
          <td colSpan={3} className="error" role="alert">
            {error}
          </td>
        </tr>
      )}
    </>
  )
}
