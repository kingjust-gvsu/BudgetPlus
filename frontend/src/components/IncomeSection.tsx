import { useEffect, useState, type FormEvent } from 'react'
import { apiGet, apiSend } from '../api/client'
import type { User } from '../api/types'
import { useAuth } from '../auth/useAuth'
import { centsToInput, formatCents, parseDollars } from '../money'
import { useLiveErrors } from '../useLiveErrors'

// The user's estimated monthly income, which percent budgets and the remainder are based on.
export function IncomeSection() {
  const { getToken } = useAuth()
  const [savedCents, setSavedCents] = useState<number | null | undefined>(undefined)
  const [amount, setAmount] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const cents = amount.trim() ? parseDollars(amount) : null
  const errors = useLiveErrors({
    amount: amount.trim() && (cents === null || cents < 0) ? 'Enter an amount like 4000 or 4,000.00.' : undefined,
  })

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
        if (current) setLoadError("Couldn't load your income. Please refresh the page.")
      })
    return () => {
      current = false
    }
  }, [getToken])

  const save = async (event: FormEvent) => {
    event.preventDefault()
    setStatus(null)
    if (!errors.trySubmit()) return
    setSaving(true)
    try {
      const user = await apiSend<User>('PATCH', '/me', await getToken(), { monthlyIncomeCents: cents })
      setSavedCents(user.monthlyIncomeCents)
      setStatus(user.monthlyIncomeCents === null ? 'Income cleared.' : `Saved: ${formatCents(user.monthlyIncomeCents)} a month.`)
    } catch (saveError) {
      errors.setServerError(saveError instanceof Error ? saveError.message : 'Saving failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const error = loadError ?? errors.error

  return (
    <section className="card" aria-labelledby="income-heading">
      <form className="income-row" onSubmit={save} aria-labelledby="income-heading">
        <h2 id="income-heading">Income</h2>
        <label htmlFor="monthly-income">Estimated monthly income ($)</label>
        <input
          id="monthly-income"
          inputMode="decimal"
          placeholder="e.g. 4000"
          className="input-income"
          disabled={savedCents === undefined}
          value={amount}
          onChange={(e) => {
            errors.touch('amount')
            setStatus(null)
            setAmount(e.target.value)
          }}
        />
        <button type="submit" className="button button-primary" disabled={saving || savedCents === undefined}>
          Save
        </button>
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
