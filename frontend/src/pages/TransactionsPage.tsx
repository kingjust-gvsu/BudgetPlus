import { useEffect, useRef, useState } from 'react'
import { apiGet, apiSend } from '../api/client'
import type { Account, Category, Transaction, TransactionInput } from '../api/types'
import { useAuth } from '../auth/useAuth'
import { CsvImport } from '../components/CsvImport'
import { transactionsToCsv } from '../csvExport'
import { readCsv, type CsvFile } from '../csvImport'
import { EditTransactionRow } from '../components/EditTransactionRow'
import { SplitButton } from '../components/SplitButton'
import { TransactionForm } from '../components/TransactionForm'
import { formatDay, formatMonth, monthOf, shiftMonth, today } from '../dates'
import { formatCents } from '../money'
import { categoryLabel } from '../transactionInput'

export function TransactionsPage() {
  const { getToken } = useAuth()
  const [month, setMonth] = useState(monthOf(today()))
  const [transactions, setTransactions] = useState<Transaction[] | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  // '' shows every account; an id shows only what went in or out of that account
  const [accountFilter, setAccountFilter] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The CSV file being imported, once the user has picked one
  const [importFile, setImportFile] = useState<{ name: string; csv: CsvFile } | null>(null)
  const filePicker = useRef<HTMLInputElement>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  // Bumped after a change, so the list reloads even when the month stays the same
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let current = true
    getToken()
      .then((token) =>
        Promise.all([
          apiGet<Transaction[]>(`/transactions?month=${month}`, token),
          apiGet<Category[]>(`/categories?month=${month}`, token),
          apiGet<Account[]>('/accounts', token),
        ]),
      )
      .then(([loadedTransactions, loadedCategories, loadedAccounts]) => {
        if (!current) return
        setTransactions(loadedTransactions)
        setCategories(loadedCategories)
        setAccounts(loadedAccounts)
        setError(null)
      })
      .catch(() => {
        if (current) setError("Couldn't load your transactions. Please refresh the page.")
      })
    return () => {
      // A newer load (e.g. after switching months) replaces this one
      current = false
    }
  }, [getToken, month, version])

  const viewing = accounts.some((a) => a.id === accountFilter) ? accountFilter : ''
  // With one account there's nothing to tell apart, and filtered to one they're all the same
  const showAccount = accounts.length > 1 && !viewing
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name
  const shown = (transactions ?? []).filter((t) => !viewing || t.accountId === viewing || t.transferAccountId === viewing)
  // Seen from the account a transfer went into, it's money coming in (like money back)
  const shownAmount = (t: Transaction) => (viewing && t.transferAccountId === viewing ? -t.amountCents : t.amountCents)

  // After a save, show the month the transaction belongs to
  const showChange = (input: TransactionInput) => {
    setMonth(monthOf(input.date))
    setVersion((v) => v + 1)
  }

  const add = async (input: TransactionInput) => {
    await apiSend('POST', '/transactions', await getToken(), input)
    showChange(input)
  }

  const update = async (id: string, input: TransactionInput) => {
    await apiSend('PATCH', `/transactions/${id}`, await getToken(), input)
    setEditingId(null)
    showChange(input)
  }

  const remove = async (transaction: Transaction) => {
    if (!window.confirm(`Delete "${transaction.description}"?`)) return
    try {
      await apiSend('DELETE', `/transactions/${transaction.id}`, await getToken())
      setVersion((v) => v + 1)
    } catch {
      setError("Couldn't delete that transaction. Please try again.")
    }
  }

  const pickImportFile = async (file: File | undefined) => {
    if (filePicker.current) filePicker.current.value = '' // so picking the same file again still works
    if (!file) return
    setNotice(null)
    const csv = readCsv(await file.text())
    if (csv.headers.length < 2 || csv.rows.length === 0) {
      setError("That file doesn't look like a CSV with a header row and transactions.")
      return
    }
    setError(null)
    setImportFile({ name: file.name, csv })
  }

  // Downloads every transaction (not just this month's) as a CSV file
  const exportCsv = async () => {
    setError(null)
    setExporting(true)
    try {
      const all = await apiGet<Transaction[]>('/transactions', await getToken())
      const url = URL.createObjectURL(new Blob([transactionsToCsv(all, categories, accounts)], { type: 'text/csv' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `budget-plus-transactions-${today()}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      setError("Couldn't export your transactions. Please try again.")
    } finally {
      setExporting(false)
    }
  }

  const changeMonth = (by: number) => {
    setEditingId(null)
    setMonth(shiftMonth(month, by))
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Transactions</h1>
          <p className="page-intro">
            Add the money you spend, and refunds as negative amounts. For paying off a card or saving into a fund,
            pick the account the money went to under Category.
          </p>
        </div>
        <div className="page-actions">
          <input
            ref={filePicker}
            type="file"
            accept=".csv,text/csv"
            className="visually-hidden"
            aria-label="CSV file to import"
            tabIndex={-1}
            onChange={(e) => pickImportFile(e.target.files?.[0])}
          />
          {!importFile && (
            <SplitButton
              label="Import from CSV"
              onClick={() => filePicker.current?.click()}
              menuLabel="More CSV options"
              items={[{ label: exporting ? 'Exporting…' : 'Export to CSV', onClick: exportCsv, disabled: exporting }]}
            />
          )}
          <div className="month-nav">
            <button type="button" className="button" aria-label="Previous month" onClick={() => changeMonth(-1)}>
              ‹
            </button>
            <span className="month-name">{formatMonth(month)}</span>
            <button type="button" className="button" aria-label="Next month" onClick={() => changeMonth(1)}>
              ›
            </button>
          </div>
        </div>
      </div>

      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}

      {importFile ? (
        <CsvImport
          key={importFile.name}
          fileName={importFile.name}
          file={importFile.csv}
          categories={categories}
          accounts={accounts}
          onCancel={() => setImportFile(null)}
          onImported={(message) => {
            setImportFile(null)
            setNotice(message)
            setVersion((v) => v + 1)
          }}
        />
      ) : (
        <TransactionForm categories={categories} accounts={accounts} onSave={add} />
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <section className="card" aria-label={`Transactions in ${formatMonth(month)}`}>
        {accounts.length > 1 && (
          <div className="field transactions-filter">
            <label htmlFor="account-filter">Show</label>
            <select id="account-filter" value={viewing} onChange={(e) => setAccountFilter(e.target.value)}>
              <option value="">All accounts</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {transactions === null ? (
          <p className="muted">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="muted">
            No transactions {viewing ? `for ${accountName(viewing)} ` : ''}in {formatMonth(month)} yet.
          </p>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Description</th>
                  {showAccount && <th scope="col">Account</th>}
                  <th scope="col">Category</th>
                  <th scope="col" className="amount">
                    Amount
                  </th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((transaction) =>
                  transaction.id === editingId ? (
                    <EditTransactionRow
                      key={transaction.id}
                      transaction={transaction}
                      categories={categories}
                      accounts={accounts}
                      showAccount={showAccount}
                      onSave={(input) => update(transaction.id, input)}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <tr key={transaction.id}>
                      <td>{formatDay(transaction.date)}</td>
                      <td>{transaction.description}</td>
                      {showAccount && <td>{accountName(transaction.accountId)}</td>}
                      <td>
                        {categoryLabel(transaction, categories, accounts, viewing) ?? <span className="muted">Uncategorized</span>}
                      </td>
                      <td className="amount">{formatCents(shownAmount(transaction))}</td>
                      <td className="row-actions">
                        <button
                          type="button"
                          className="link-button"
                          aria-label={`Edit ${transaction.description}`}
                          onClick={() => setEditingId(transaction.id)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="link-button"
                          aria-label={`Delete ${transaction.description}`}
                          onClick={() => remove(transaction)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
