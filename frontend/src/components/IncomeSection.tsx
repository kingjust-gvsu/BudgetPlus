import { useEffect, useState, type FormEvent } from 'react'
import { apiGet, apiSend } from '../api/client'
import type { User } from '../api/types'
import { useAuth } from '../auth/useAuth'
import { centsToInput, formatCents, parseDollars } from '../money'

// The user's estimated monthly income, which percent budgets and the remainder are based on.
export function IncomeSection() {
  const { getToken } = useAuth()
  const [savedCents, setSavedCents] = useState<number | null | undefined>(undefined)
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let current = true
    getToken()
      .then((token) => apiGet<User>('/me', token))
      .then((user) => {
        if (!current) return
        setSavedCents(user.monthlyIncomeCents)
        setAmount(user.monthlyIncomeCents === null ? '' : centsToInput(user.monthlyIncomeCents))
      })
      .catch(() => {
        if (current) setError("Couldn't load your income. Please refresh the page.")
      })
    return () => {
      current = false
    }
  }, [getToken])

  const save = async (event: FormEvent) => {
    event.preventDefault()
    setStatus(null)
    const cents = amount.trim() ? parseDollars(amount) : null
    if (amount.trim() && (cents === null || cents < 0)) {
      setError('Enter an amount like 4000 or 4,000.00.')
      return
    }
    setError(null)
    setSaving(true)
    try {
      const user = await apiSend<User>('PATCH', '/me', await getToken(), { monthlyIncomeCents: cents })
      setSavedCents(user.monthlyIncomeCents)
      setStatus(user.monthlyIncomeCents === null ? 'Income cleared.' : `Saved: ${formatCents(user.monthlyIncomeCents)} a month.`)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Saving failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card" aria-labelledby="income-heading">
      <h2 id="income-heading">Income</h2>
      <form className="form-row" onSubmit={save} aria-label="Monthly income">
        <div className="field">
          <label htmlFor="monthly-income">Estimated monthly income ($)</label>
          <input
            id="monthly-income"
            inputMode="decimal"
            placeholder="e.g. 4000"
            className="input-income"
            disabled={savedCents === undefined}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <button type="submit" className="button button-primary" disabled={saving || savedCents === undefined}>
          Save
        </button>
        <span className="muted small">Percent budgets and the remainder are based on this.</span>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {status && (
        <p className="success" role="status">
          {status}
        </p>
      )}
    </section>
  )
}
