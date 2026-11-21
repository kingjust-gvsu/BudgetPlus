import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ACCOUNT_TYPE_NAMES, flipForCard, formatBalance, showsOwed } from '../accounts'
import { ApiError, apiGet, apiSend } from '../api/client'
import type { Account, AccountInput, AccountType } from '../api/types'
import { useAuth } from '../auth/useAuth'
import { formatDate, today } from '../dates'
import { centsToInput, formatCents, parseDollars } from '../money'
import './AccountsPage.css'

const startingLabel = (type: AccountType) => (showsOwed(type) ? 'Amount owed' : 'Starting balance')

type FormValues = { name: string; type: AccountType; starting: string; startDate: string }

const emptyForm = (): FormValues => ({ name: '', type: 'BANK', starting: '', startDate: today() })

// Checks the form and turns it into what the API takes, or returns the problem to show
function readForm(values: FormValues): AccountInput | string {
  if (!values.name.trim()) return 'Give the account a name, like "Checking".'
  const shown = values.starting.trim() === '' ? 0 : parseDollars(values.starting)
  if (shown === null) return `Enter the ${startingLabel(values.type).toLowerCase()} like 1250 or 1,250.00.`
  if (!values.startDate) return 'Enter the date the starting balance is from.'
  return { name: values.name.trim(), type: values.type, startingBalanceCents: flipForCard(values.type, shown), startDate: values.startDate }
}

// Where money is kept: bank accounts, credit cards, and savings funds, each with its balance.
export function AccountsPage() {
  const { getToken } = useAuth()
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [form, setForm] = useState<FormValues>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [edit, setEdit] = useState<FormValues>(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = async () => setAccounts(await apiGet<Account[]>('/accounts', await getToken()))

  useEffect(() => {
    let current = true
    getToken()
      .then((token) => apiGet<Account[]>('/accounts', token))
      .then((loaded) => {
        if (current) setAccounts(loaded)
      })
      .catch(() => {
        if (current) setError("Couldn't load your accounts. Please refresh the page.")
      })
    return () => {
      current = false
    }
  }, [getToken])

  // Sends a change and reloads the list; returns whether it worked
  const send = async (method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown) => {
    setSaving(true)
    setError(null)
    try {
      await apiSend(method, path, await getToken(), body)
      await load()
      return true
    } catch (sendError) {
      setError(sendError instanceof ApiError ? sendError.message : 'Saving failed. Please try again.')
      return false
    } finally {
      setSaving(false)
    }
  }

  const add = async (event: FormEvent) => {
    event.preventDefault()
    const input = readForm(form)
    if (typeof input === 'string') return setError(input)
    if (await send('POST', '/accounts', input)) setForm(emptyForm())
  }

  const startEditing = (account: Account) => {
    setEditingId(account.id)
    setEdit({
      name: account.name,
      type: account.type,
      starting: centsToInput(flipForCard(account.type, account.startingBalanceCents)),
      startDate: account.startDate,
    })
    setError(null)
  }

  const saveEdit = async () => {
    const input = readForm(edit)
    if (typeof input === 'string') return setError(input)
    if (await send('PATCH', `/accounts/${editingId}`, input)) setEditingId(null)
  }

  const editKeys = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      saveEdit()
    } else if (event.key === 'Escape') {
      setEditingId(null)
    }
  }

  const remove = (account: Account) => {
    if (!window.confirm(`Delete "${account.name}"?`)) return
    send('DELETE', `/accounts/${account.id}`)
  }

  const total = accounts?.reduce((sum, a) => sum + a.balanceCents, 0) ?? 0

  return (
    <>
      <h1 className="page-title">Accounts</h1>

      <section className="card" aria-labelledby="accounts-heading">
        <h2 id="accounts-heading">Your accounts</h2>
        {!accounts ? (
          !error && <p className="muted">Loading…</p>
        ) : accounts.length === 0 ? (
          <p className="muted">Add each place you keep money: bank accounts, credit cards, and savings funds.</p>
        ) : (
          <div className="table-scroll">
            <table className="table accounts-table">
              <thead>
                <tr>
                  <th scope="col">Account</th>
                  <th scope="col">Type</th>
                  <th scope="col" className="amount">Starting balance</th>
                  <th scope="col">Since</th>
                  <th scope="col" className="amount">Balance</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) =>
                  account.id === editingId ? (
                    <tr key={account.id} className="editing-row" onKeyDown={editKeys}>
                      <td>
                        <input
                          className="cell-input cell-input-grow"
                          aria-label={`Name for ${account.name}`}
                          maxLength={100}
                          autoFocus
                          value={edit.name}
                          onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                        />
                      </td>
                      <td>
                        <select
                          className="cell-input"
                          aria-label={`Type for ${account.name}`}
                          value={edit.type}
                          onChange={(e) => setEdit({ ...edit, type: e.target.value as AccountType })}
                        >
                          {Object.entries(ACCOUNT_TYPE_NAMES).map(([type, label]) => (
                            <option key={type} value={type}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="amount">
                        <input
                          className="cell-input input-amount"
                          aria-label={`${startingLabel(edit.type)} for ${account.name}`}
                          inputMode="decimal"
                          value={edit.starting}
                          onChange={(e) => setEdit({ ...edit, starting: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="cell-input"
                          type="date"
                          aria-label={`Start date for ${account.name}`}
                          value={edit.startDate}
                          onChange={(e) => setEdit({ ...edit, startDate: e.target.value })}
                        />
                      </td>
                      <td className="amount">{formatBalance(account.type, account.balanceCents)}</td>
                      <td className="row-actions">
                        <button type="button" className="link-button" onClick={saveEdit} disabled={saving}>
                          Save
                        </button>
                        <button type="button" className="link-button" onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={account.id}>
                      <td className="account-name">{account.name}</td>
                      <td>{ACCOUNT_TYPE_NAMES[account.type]}</td>
                      <td className="amount">{formatBalance(account.type, account.startingBalanceCents)}</td>
                      <td>{formatDate(account.startDate)}</td>
                      <td className="amount account-balance">{formatBalance(account.type, account.balanceCents)}</td>
                      <td className="row-actions">
                        <button
                          type="button"
                          className="link-button"
                          aria-label={`Edit ${account.name}`}
                          onClick={() => startEditing(account)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="link-button"
                          aria-label={`Delete ${account.name}`}
                          onClick={() => remove(account)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
              <tfoot>
                <tr className="accounts-total">
                  <th scope="row" colSpan={4}>
                    Total
                  </th>
                  <td className="amount">{formatCents(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>

      <section className="card" aria-labelledby="add-account-heading">
        <h2 id="add-account-heading">Add an account</h2>
        <form className="form-row" onSubmit={add} aria-label="Add an account">
          <div className="field field-grow">
            <label htmlFor="new-account-name">Name</label>
            <input
              id="new-account-name"
              placeholder="e.g. Checking"
              maxLength={100}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="new-account-type">Type</label>
            <select
              id="new-account-type"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as AccountType })}
            >
              {Object.entries(ACCOUNT_TYPE_NAMES).map(([type, label]) => (
                <option key={type} value={type}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="new-account-starting">{startingLabel(form.type)}</label>
            <input
              id="new-account-starting"
              className="input-amount"
              inputMode="decimal"
              placeholder="0.00"
              value={form.starting}
              onChange={(e) => setForm({ ...form, starting: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="new-account-date">On</label>
            <input
              id="new-account-date"
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
          </div>
          <button type="submit" className="button button-primary" disabled={saving}>
            Add account
          </button>
        </form>
        <p className="muted small">Transactions before this date don't change the balance.</p>
      </section>
    </>
  )
}
