import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, apiGet, apiSend } from '../api/client'
import type { MonthIncome } from '../api/types'
import { useAuth } from '../auth/useAuth'
import { formatMonth, monthOf, today } from '../dates'
import { centsToInput, formatCents, parseDollars } from '../money'
import './IncomeSection.css'

type Editing = { kind: 'source'; id: string } | { kind: 'other' } | { kind: 'new' } | null

const AMOUNT_HINT = 'Enter an amount like 2600 or 2,600.00.'

// This month's income: regular sources (which carry over to later months) and "Other" income,
// which is for this month only. Percent budgets and the remainder use the total. Like the rest of
// Budget setup, changes start this month, so past months keep what they had.
export function IncomeSection() {
  const { getToken } = useAuth()
  const month = monthOf(today())
  const [income, setIncome] = useState<MonthIncome | null>(null)
  const [editing, setEditing] = useState<Editing>(null)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let current = true
    getToken()
      .then((token) => apiGet<MonthIncome>(`/income?month=${month}`, token))
      .then((loaded) => {
        if (!current) return
        setIncome(loaded)
        setError(null)
      })
      .catch(() => {
        if (current) setError("Couldn't load your income. Please refresh the page.")
      })
    return () => {
      current = false
    }
  }, [getToken, month])

  const startEditing = (next: Editing, startName = '', startCents: number | null = null) => {
    setEditing(next)
    setName(startName)
    setAmount(startCents === null ? '' : centsToInput(startCents))
    setError(null)
  }

  // Sends a change; the API answers with the month's updated income
  const send = async (method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body?: unknown) => {
    setSaving(true)
    setError(null)
    try {
      setIncome(await apiSend<MonthIncome>(method, path, await getToken(), body))
      setEditing(null)
    } catch (sendError) {
      setError(sendError instanceof ApiError ? sendError.message : 'Saving failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const save = (event: FormEvent) => {
    event.preventDefault()
    const cents = parseDollars(amount)
    if (cents === null || cents < 0) return setError(AMOUNT_HINT)
    if (editing?.kind !== 'other' && !name.trim()) return setError('Give the income a name, like "Income 1".')
    if (editing?.kind === 'new') return send('POST', '/income/sources', { name: name.trim(), amountCents: cents, month })
    if (editing?.kind === 'other') return send('PUT', '/income/other', { month, amountCents: cents })
    if (editing?.kind === 'source') {
      return send('PATCH', `/income/sources/${editing.id}`, { month, name: name.trim(), amountCents: cents })
    }
  }

  // Stops the income from this month on; earlier months keep it
  const remove = (id: string, sourceName: string) => {
    if (!window.confirm(`Remove "${sourceName}" from ${formatMonth(month)} on? Earlier months keep it.`)) return
    send('DELETE', `/income/sources/${id}?month=${month}`)
  }

  const editForm = (label: string, withName: boolean, note: string) => (
    <form className="income-edit" onSubmit={save} aria-label={label}>
      {withName && (
        <input
          aria-label="Income name"
          placeholder="e.g. Income 1"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      )}
      <input
        aria-label="Amount ($)"
        inputMode="decimal"
        placeholder="0.00"
        className="input input-amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        autoFocus={!withName}
      />
      <button type="submit" className="button button-primary" disabled={saving}>
        Save
      </button>
      <button type="button" className="link-button" onClick={() => setEditing(null)}>
        Cancel
      </button>
      <span className="muted small income-edit-note">{note}</span>
    </form>
  )

  return (
    <section className="card" aria-labelledby="income-heading">
      <div className="income-top">
        <h2 id="income-heading">Income</h2>
      </div>

      {!income ? (
        !error && <p className="muted">Loading…</p>
      ) : (
        <>
          {income.sources.length === 0 && editing?.kind !== 'new' && (
            <p className="muted">Add each regular income, like each paycheck in your household.</p>
          )}
          <ul className="income-list">
            {income.sources.map((source) =>
              editing?.kind === 'source' && editing.id === source.id ? (
                <li key={source.id} className="income-item editing">
                  {editForm(`Edit ${source.name}`, true, `Applies to ${formatMonth(month)} and later months.`)}
                </li>
              ) : (
                <li key={source.id} className="income-item">
                  <span className="income-name">{source.name}</span>
                  <span className="income-amount">{formatCents(source.amountCents)}</span>
                  <span className="row-actions">
                    <button
                      type="button"
                      className="link-button"
                      aria-label={`Edit ${source.name}`}
                      onClick={() => startEditing({ kind: 'source', id: source.id }, source.name, source.amountCents)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="link-button"
                      aria-label={`Delete ${source.name}`}
                      onClick={() => remove(source.id, source.name)}
                    >
                      Delete
                    </button>
                  </span>
                </li>
              ),
            )}

            {editing?.kind === 'other' ? (
              <li className="income-item editing">
                {editForm('Edit other income', false, `For ${formatMonth(month)} only, like a bonus or a tax refund.`)}
              </li>
            ) : (
              <li className="income-item">
                <span className="income-name">Other</span>
                <span className="income-amount">{formatCents(income.otherCents)}</span>
                <span className="row-actions">
                  <button
                    type="button"
                    className="link-button"
                    aria-label="Edit other income"
                    onClick={() => startEditing({ kind: 'other' }, '', income.otherCents)}
                  >
                    Edit
                  </button>
                </span>
              </li>
            )}

            {editing?.kind === 'new' && (
              <li className="income-item editing">
                {editForm('Add income source', true, `Starts in ${formatMonth(month)} and carries over to later months.`)}
              </li>
            )}

            <li className="income-item income-total">
              <span className="income-name">Total</span>
              <span className="income-amount">{formatCents(income.totalCents ?? 0)}</span>
            </li>
          </ul>

          {editing?.kind !== 'new' && (
            <button type="button" className="button income-add" onClick={() => startEditing({ kind: 'new' })}>
              + Add income source
            </button>
          )}
        </>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
