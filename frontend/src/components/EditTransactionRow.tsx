import { useState, type KeyboardEvent } from 'react'
import type { Account, Category, Transaction, TransactionInput } from '../api/types'
import { centsToInput } from '../money'
import { categoryChoiceOf, readTransactionFields } from '../transactionInput'
import { CategoryOptions } from './CategoryOptions'

type Props = {
  transaction: Transaction
  categories: Category[]
  accounts: Account[]
  // Whether the table has an Account column
  showAccount: boolean
  onSave: (input: TransactionInput) => Promise<void>
  onCancel: () => void
}

// A table row whose cells become inputs, for editing a transaction in place.
// Enter saves and Escape cancels.
export function EditTransactionRow({ transaction, categories, accounts, showAccount, onSave, onCancel }: Props) {
  const [date, setDate] = useState(transaction.date)
  const [description, setDescription] = useState(transaction.description)
  const [accountId, setAccountId] = useState(transaction.accountId)
  const [categoryChoice, setCategoryChoice] = useState(categoryChoiceOf(transaction))
  const [amount, setAmount] = useState(centsToInput(transaction.amountCents))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const result = readTransactionFields({ date, description, accountId, categoryChoice, amount })
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
        {showAccount && (
          <td>
            <select className="cell-input" aria-label={label('Account')} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </td>
        )}
        <td>
          <select
            className="cell-input"
            aria-label={label('Category')}
            value={categoryChoice}
            onChange={(e) => setCategoryChoice(e.target.value)}
          >
            <CategoryOptions categories={categories} accounts={accounts} accountId={accountId} />
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
          <td colSpan={showAccount ? 6 : 5} className="error" role="alert">
            {error}
          </td>
        </tr>
      )}
    </>
  )
}
