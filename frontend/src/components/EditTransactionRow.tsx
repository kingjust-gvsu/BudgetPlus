import { useState, type KeyboardEvent } from 'react'
import type { Category, Transaction, TransactionInput } from '../api/types'
import { centsToInput } from '../money'
import { readTransactionFields } from '../transactionInput'

type Props = {
  transaction: Transaction
  categories: Category[]
  onSave: (input: TransactionInput) => Promise<void>
  onCancel: () => void
}

// A table row whose cells become inputs, for editing a transaction in place.
// Enter saves and Escape cancels.
export function EditTransactionRow({ transaction, categories, onSave, onCancel }: Props) {
  const [date, setDate] = useState(transaction.date)
  const [description, setDescription] = useState(transaction.description)
  const [categoryId, setCategoryId] = useState(transaction.categoryId ?? '')
  const [amount, setAmount] = useState(centsToInput(transaction.amountCents))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const result = readTransactionFields({ date, description, categoryId, amount })
    if ('error' in result) {
      setError(result.error)
      return
    }
    setError(null)
    setSaving(true)
    try {
      await onSave(result.input)
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

  const label = (field: string) => `${field} for ${transaction.description}`

  return (
    <>
      <tr className="editing-row" onKeyDown={handleKeyDown}>
        <td>
          <input
            type="date"
            className="cell-input"
            aria-label={label('Date')}
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </td>
        <td>
          <input
            className="cell-input cell-input-grow"
            aria-label={label('Description')}
            maxLength={200}
            autoFocus
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </td>
        <td>
          <select
            className="cell-input"
            aria-label={label('Category')}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">Uncategorized</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </td>
        <td className="amount">
          <input
            className="cell-input input-amount"
            inputMode="decimal"
            aria-label={label('Amount')}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
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
          <td colSpan={5} className="error" role="alert">
            {error}
          </td>
        </tr>
      )}
    </>
  )
}
