import { useState, type FormEvent } from 'react'
import type { Category, TransactionInput } from '../api/types'
import { today } from '../dates'
import { readTransactionFields } from '../transactionInput'

type Props = {
  categories: Category[]
  onSave: (input: TransactionInput) => Promise<void>
}

// Form for adding a transaction.
export function TransactionForm({ categories, onSave }: Props) {
  const [date, setDate] = useState(today())
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const result = readTransactionFields({ date, description, categoryId, amount })
    if ('error' in result) {
      setError(result.error)
      return
    }

    setError(null)
    setSaving(true)
    try {
      await onSave(result.input)
      // Ready for the next one; keep the date, since several often share it
      setDescription('')
      setAmount('')
      setCategoryId('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Saving failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} aria-label="Add a transaction">
      <h2>Add a transaction</h2>
      <div className="form-row">
        <div className="field">
          <label htmlFor="add-date">Date</label>
          <input id="add-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field field-grow">
          <label htmlFor="add-description">Description</label>
          <input
            id="add-description"
            placeholder="e.g. Meijer"
            maxLength={200}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="add-category">Category</label>
          <select id="add-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Uncategorized</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="add-amount">Amount ($)</label>
          <input
            id="add-amount"
            inputMode="decimal"
            placeholder="0.00"
            className="input-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <button type="submit" className="button button-primary" disabled={saving}>
          Add
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
