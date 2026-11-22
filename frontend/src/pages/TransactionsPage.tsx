import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { apiGet, apiSend } from '../api/client'
import type { Account, Category, IncomeSourceName, Transaction, TransactionInput } from '../api/types'
import { useAuth } from '../auth/useAuth'
import { CsvImport } from '../components/CsvImport'
import { transactionsToCsv } from '../csvExport'
import { readCsv, type CsvFile } from '../csvImport'
import { EditTransactionRow } from '../components/EditTransactionRow'
import { SplitButton } from '../components/SplitButton'
import { TransactionForm } from '../components/TransactionForm'
import { formatDay, formatMonth, monthOf, today } from '../dates'
import { formatCents } from '../money'
import { categoryLabel, formatAmount, isIncome } from '../transactionInput'
import { useMonth } from '../useMonth'

// Not spending in any category: no category, and not a transfer or income
const isUncategorized = (t: Transaction) =>
  t.categoryId === null && t.transferAccountId === null && t.incomeSourceId === null && !t.isOtherIncome

export function TransactionsPage() {
  const { getToken } = useAuth()
  // The month, category, and sort live in the address, so other pages can link to a filtered list
  const [month, setMonth] = useMonth()
  const [params, setParams] = useSearchParams()
  // '' shows every category, 'uncategorized' shows spending without one, an id shows that category
  const categoryFilter = params.get('category') ?? ''
  const sort = params.get('sort') === 'amount' ? 'amount' : 'date'
  const setParam = (name: string, value: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value) next.set(name, value)
        else next.delete(name)
        return next
      },
      { replace: true },
    )
  const [transactions, setTransactions] = useState<Transaction[] | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [incomeSources, setIncomeSources] = useState<IncomeSourceName[]>([])
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
          apiGet<IncomeSourceName[]>('/income/sources', token),
        ]),
      )
      .then(([loadedTransactions, loadedCategories, loadedAccounts, loadedSources]) => {
        if (!current) return
        setTransactions(loadedTransactions)
        setCategories(loadedCategories)
        setAccounts(loadedAccounts)
        setIncomeSources(loadedSources)
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
  const shown = (transactions ?? [])
    .filter((t) => !viewing || t.accountId === viewing || t.transferAccountId === viewing)
    .filter((t) => !categoryFilter || (categoryFilter === 'uncategorized' ? isUncategorized(t) : t.categoryId === categoryFilter))
  // The list comes newest first; largest first puts the biggest spending at the top
  if (sort === 'amount') shown.sort((a, b) => b.amountCents - a.amountCents)
  const filterName =
    categoryFilter === 'uncategorized' ? 'uncategorized' : categories.find((c) => c.id === categoryFilter)?.name
  // Seen from the account a transfer went into, it's money coming in (like money back)
  const shownAmount = (t: Transaction) =>
    viewing && t.transferAccountId === viewing ? formatCents(-t.amountCents) : formatAmount(t)
  const names = { categories, accounts, incomeSources }

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
      const url = URL.createObjectURL(new Blob([transactionsToCsv(all, names)], { type: 'text/csv' }))
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

  // Stop editing when the month changes
  const [editingMonth, setEditingMonth] = useState(month)
  if (editingMonth !== month) {
    setEditingMonth(month)
    setEditingId(null)
  }

  return (
    <>
      <div className="page-header">
        <div>
          <p className="page-intro page-intro-top">
            Add the money you spend, and refunds as negative amounts. For a paycheck, pick its income under
            Category. For paying off a card or saving into a fund, pick the account the money went to.
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
          names={names}
          onCancel={() => setImportFile(null)}
          onImported={(message) => {
            setImportFile(null)
            setNotice(message)
            setVersion((v) => v + 1)
          }}
        />
      ) : (
        <TransactionForm categories={categories} accounts={accounts} incomeSources={incomeSources} onSave={add} />
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <section className="card" aria-label={`Transactions in ${formatMonth(month)}`}>
        <div className="transactions-filters">
          <div className="field transactions-filter">
            <span aria-hidden="true">Show</span>
            {accounts.length > 1 && (
              <select aria-label="Filter by account" value={viewing} onChange={(e) => setAccountFilter(e.target.value)}>
                <option value="">All accounts</option>
                {accounts
                  .filter((a) => !a.closed)
                  .map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                {accounts.some((a) => a.closed) && (
                  <optgroup label="Closed">
                    {accounts
                      .filter((a) => a.closed)
                      .map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                  </optgroup>
                )}
              </select>
            )}
            <select aria-label="Filter by category" value={categoryFilter} onChange={(e) => setParam('category', e.target.value)}>
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
              <option value="uncategorized">Uncategorized</option>
            </select>
          </div>
          <div className="field transactions-filter">
            <label htmlFor="sort">Sort</label>
            <select id="sort" value={sort} onChange={(e) => setParam('sort', e.target.value === 'amount' ? 'amount' : '')}>
              <option value="date">Newest first</option>
              <option value="amount">Largest first</option>
            </select>
          </div>
        </div>
        {transactions === null ? (
          <p className="muted">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="muted">
            No {filterName ? `${filterName} ` : ''}transactions {viewing ? `for ${accountName(viewing)} ` : ''}in{' '}
            {formatMonth(month)}.

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
                      incomeSources={incomeSources}
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
                        {categoryLabel(transaction, names, viewing) ?? <span className="muted">Uncategorized</span>}
                      </td>
                      <td className={isIncome(transaction) ? 'amount amount-in' : 'amount'}>{shownAmount(transaction)}</td>
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
