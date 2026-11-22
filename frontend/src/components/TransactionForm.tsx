import { useState, type FormEvent, type ReactNode } from 'react'
import type { Account, Category, IncomeSourceName, TransactionInput } from '../api/types'
import { today } from '../dates'
import { readTransactionFields } from '../transactionInput'
import { CategoryOptions } from './CategoryOptions'

type Props = {
  categories: Category[]
  accounts: Account[]
  incomeSources: IncomeSourceName[]
  onSave: (input: TransactionInput) => Promise<void>
  // Extra buttons beside the heading, like import and export
  actions?: ReactNode
}

// Form for adding a transaction, or a transfer between accounts.
export function TransactionForm({ categories, accounts, incomeSources, onSave, actions }: Props) {
  const [date, setDate] = useState(today())
  const [description, setDescription] = useState('')
  // '' until picked: then the first account (bank accounts come first)
  const [pickedAccountId, setPickedAccountId] = useState('')
  const [categoryChoice, setCategoryChoice] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Closed accounts aren't offered for new transactions
  const openAccounts = accounts.filter((a) => !a.closed)
  const accountId = openAccounts.some((a) => a.id === pickedAccountId) ? pickedAccountId : (openAccounts[0]?.id ?? '')

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const result = readTransactionFields({ date, description, accountId, categoryChoice, amount })
    if ('error' in result) {
      setError(result.error)
      return
    }

    setError(null)
    setSaving(true)
    try {
      await onSave(result.input)
      // Ready for the next one; keep the date and account, since several often share them
      setDescription('')
      setAmount('')
      setCategoryChoice('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Saving failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} aria-label="Add a transaction">
      <div className="form-card-top">
        <h2>Add a transaction</h2>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
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
        {openAccounts.length > 1 && (
          <div className="field">
            <label htmlFor="add-account">Account</label>
            <select id="add-account" value={accountId} onChange={(e) => setPickedAccountId(e.target.value)}>
              {openAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="add-category">Category</label>
          <select id="add-category" value={categoryChoice} onChange={(e) => setCategoryChoice(e.target.value)}>
            <CategoryOptions categories={categories} accounts={accounts} incomeSources={incomeSources} accountId={accountId} />
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
