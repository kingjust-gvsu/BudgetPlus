import { Fragment, useEffect, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { ACCOUNT_TYPE_NAMES, flipForCard, formatBalance, showsOwed } from '../accounts'
import { ApiError, apiGet, apiSend } from '../api/client'
import type { Account, AccountInput, AccountType } from '../api/types'
import { useAuth } from '../auth/useAuth'
import { AccountIcon } from '../components/AccountIcon'
import { formatDate, today } from '../dates'
import { centsToInput, formatCents, parseDollars } from '../money'
import './AccountsPage.css'

const startingLabel = (type: AccountType) => (showsOwed(type) ? 'Amount owed' : 'Starting balance')

// `parent` is the bank account a bucket is in ('' for none)
type FormValues = { name: string; type: AccountType; starting: string; startDate: string; parent: string }

const emptyForm = (type: AccountType = 'BANK', parent = ''): FormValues => ({ name: '', type, starting: '', startDate: today(), parent })

// Buckets are added under a bank account, so the add form offers only these
const TOP_LEVEL_TYPES: AccountType[] = ['BANK', 'CREDIT_CARD']

// Checks the form and turns it into what the API takes, or returns the problem to show
function readForm(values: FormValues): AccountInput | string {
  if (!values.name.trim()) return values.type === 'FUND' ? 'Give the bucket a name, like "Fun money".' : 'Give the account a name, like "Checking".'
  const shown = values.starting.trim() === '' ? 0 : parseDollars(values.starting)
  if (shown === null) return `Enter the ${startingLabel(values.type).toLowerCase()} like 1250 or 1,250.00.`
  if (!values.startDate) return 'Enter the date the starting balance is from.'
  return {
    name: values.name.trim(),
    type: values.type,
    startingBalanceCents: flipForCard(values.type, shown),
    startDate: values.startDate,
    ...(values.type === 'FUND' && { parentAccountId: values.parent || null }),
  }
}

// Where money is kept: bank accounts and credit cards, each with its balance. A bank account can hold
// buckets (money earmarked for something); its total is its own money plus its buckets'.
export function AccountsPage() {
  const { getToken } = useAuth()
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [form, setForm] = useState<FormValues>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [edit, setEdit] = useState<FormValues>(emptyForm)
  // The bank account whose "Add bucket" form is open, and that form
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [bucket, setBucket] = useState<FormValues>(() => emptyForm('FUND'))
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
      parent: account.parentAccountId ?? '',
    })
    setError(null)
  }

  const startAddingBucket = (bank: Account) => {
    setAddingTo(bank.id)
    setBucket(emptyForm('FUND', bank.id))
    setError(null)
  }

  const addBucket = async (event: FormEvent) => {
    event.preventDefault()
    const input = readForm(bucket)
    if (typeof input === 'string') return setError(input)
    if (await send('POST', '/accounts', input)) setAddingTo(null)
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

  // A closed account keeps its transactions but isn't offered for new ones
  const close = (account: Account) => {
    const left = account.balanceCents !== 0 ? ` It still has ${formatBalance(account.type, account.balanceCents)}.` : ''
    if (!window.confirm(`Close "${account.name}"?${left} It keeps its transactions, but won't be offered for new ones.`)) return
    send('PATCH', `/accounts/${account.id}`, { closed: true })
  }

  const open = accounts?.filter((a) => !a.closed) ?? []
  const closed = accounts?.filter((a) => a.closed) ?? []
  const total = open.reduce((sum, a) => sum + a.balanceCents, 0)
  const openBanks = open.filter((a) => a.type === 'BANK')
  const bucketsIn = (bank: Account) => open.filter((a) => a.parentAccountId === bank.id)
  // Buckets show under their bank account; the rest (and buckets with no open bank account) on their own
  const topLevel = open.filter((a) => !openBanks.some((b) => b.id === a.parentAccountId))
  // A bank account's total: its own money plus its buckets'
  const totalOf = (account: Account) => account.balanceCents + bucketsIn(account).reduce((sum, b) => sum + b.balanceCents, 0)

  const editRow = (account: Account, inBank: boolean) => (
    <tr key={account.id} className={inBank ? 'editing-row bucket-row' : 'editing-row'} onKeyDown={editKeys}>
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
        {account.type === 'FUND' ? (
          <select
            className="cell-input"
            aria-label={`Bank account for ${account.name}`}
            value={edit.parent}
            onChange={(e) => setEdit({ ...edit, parent: e.target.value })}
          >
            <option value="">Not in an account</option>
            {openBanks.map((bank) => (
              <option key={bank.id} value={bank.id}>
                In {bank.name}
              </option>
            ))}
          </select>
        ) : (
          <select
            className="cell-input"
            aria-label={`Type for ${account.name}`}
            value={edit.type}
            onChange={(e) => setEdit({ ...edit, type: e.target.value as AccountType })}
          >
            {TOP_LEVEL_TYPES.map((type) => (
              <option key={type} value={type}>
                {ACCOUNT_TYPE_NAMES[type]}
              </option>
            ))}
          </select>
        )}
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
  )

  const viewRow = (account: Account, inBank: boolean, balanceCents: number) => (
    <tr key={account.id} className={inBank ? 'bucket-row' : undefined}>
      <td>
        <span className="with-icon">
          <AccountIcon type={account.type} />
          <span className="account-name">{account.name}</span>
        </span>
      </td>
      <td>{ACCOUNT_TYPE_NAMES[account.type]}</td>
      <td className="amount">{formatBalance(account.type, account.startingBalanceCents)}</td>
      <td>{formatDate(account.startDate)}</td>
      <td className="amount account-balance">{formatBalance(account.type, balanceCents)}</td>
      <td className="row-actions">
        <button type="button" className="link-button" aria-label={`Edit ${account.name}`} onClick={() => startEditing(account)}>
          Edit
        </button>
        <button type="button" className="link-button" aria-label={`Close ${account.name}`} onClick={() => close(account)}>
          Close
        </button>
        <button type="button" className="link-button" aria-label={`Delete ${account.name}`} onClick={() => remove(account)}>
          Delete
        </button>
      </td>
    </tr>
  )

  const row = (account: Account, inBank = false, balanceCents = account.balanceCents) =>
    account.id === editingId ? editRow(account, inBank) : viewRow(account, inBank, balanceCents)

  // Under a bank account: its buckets, the money not in a bucket, and a way to add a bucket
  const bankExtras = (bank: Account): ReactNode => {
    const buckets = bucketsIn(bank)
    return (
      <>
        {buckets.map((b) => row(b, true))}
        {buckets.length > 0 && (
          <tr className="bucket-row bucket-rest">
            <td colSpan={4}>Not in a bucket</td>
            <td className="amount">{formatBalance(bank.type, bank.balanceCents)}</td>
            <td />
          </tr>
        )}
        {addingTo === bank.id ? (
          <tr className="editing-row bucket-row">
            <td>
              <input
                className="cell-input cell-input-grow"
                aria-label={`New bucket name in ${bank.name}`}
                placeholder="e.g. Fun money"
                maxLength={100}
                autoFocus
                value={bucket.name}
                onChange={(e) => setBucket({ ...bucket, name: e.target.value })}
                onKeyDown={(e) => e.key === 'Escape' && setAddingTo(null)}
              />
            </td>
            <td>{ACCOUNT_TYPE_NAMES.FUND}</td>
            <td className="amount">
              <input
                className="cell-input input-amount"
                aria-label={`New bucket starting balance in ${bank.name}`}
                inputMode="decimal"
                placeholder="0.00"
                value={bucket.starting}
                onChange={(e) => setBucket({ ...bucket, starting: e.target.value })}
              />
            </td>
            <td>
              <input
                className="cell-input"
                type="date"
                aria-label={`New bucket start date in ${bank.name}`}
                value={bucket.startDate}
                onChange={(e) => setBucket({ ...bucket, startDate: e.target.value })}
              />
            </td>
            <td />
            <td className="row-actions">
              <button type="button" className="link-button" onClick={addBucket} disabled={saving}>
                Add
              </button>
              <button type="button" className="link-button" onClick={() => setAddingTo(null)}>
                Cancel
              </button>
            </td>
          </tr>
        ) : (
          <tr className="bucket-row bucket-add">
            <td colSpan={6}>
              <button type="button" className="link-button" onClick={() => startAddingBucket(bank)}>
                + Add bucket to {bank.name}
              </button>
            </td>
          </tr>
        )}
      </>
    )
  }

  return (
    <>
      <h1 className="page-title">Accounts</h1>

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
              {TOP_LEVEL_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ACCOUNT_TYPE_NAMES[type]}
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

      <section className="card" aria-labelledby="accounts-heading">
        <h2 id="accounts-heading">Your accounts</h2>
        {!accounts ? (
          !error && <p className="muted">Loading…</p>
        ) : open.length === 0 ? (
          <p className="muted">Add each place you keep money: bank accounts, credit cards, and buckets for money you set aside.</p>
        ) : (
          <div className="table-scroll">
            <table className="table table-navy accounts-table">
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
                {topLevel.map((account) =>
                  account.type === 'BANK' ? (
                    <Fragment key={account.id}>
                      {row(account, false, totalOf(account))}
                      {bankExtras(account)}
                    </Fragment>
                  ) : (
                    row(account)
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

      {closed.length > 0 && (
        <section className="card" aria-labelledby="closed-accounts-heading">
          <h2 id="closed-accounts-heading">Closed accounts</h2>
          <p className="muted small">They keep their transactions but aren't offered for new ones.</p>
          <div className="table-scroll">
            <table className="table table-navy accounts-table">
              <thead>
                <tr>
                  <th scope="col">Account</th>
                  <th scope="col">Type</th>
                  <th scope="col" className="amount">
                    Balance
                  </th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {closed.map((account) => (
                  <tr key={account.id}>
                    <td>
                      <span className="with-icon">
                        <AccountIcon type={account.type} />
                        <span className="account-name">{account.name}</span>
                      </span>
                    </td>
                    <td className="muted">{ACCOUNT_TYPE_NAMES[account.type]}</td>
                    <td className="amount">{formatBalance(account.type, account.balanceCents)}</td>
                    <td className="row-actions">
                      <button
                        type="button"
                        className="link-button"
                        aria-label={`Reopen ${account.name}`}
                        onClick={() => send('PATCH', `/accounts/${account.id}`, { closed: false })}
                      >
                        Reopen
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
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

    </>
  )
}
