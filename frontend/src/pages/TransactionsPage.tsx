import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { apiGet, apiSend } from '../api/client'
import type { Account, Category, IncomeSourceName, Transaction, TransactionInput } from '../api/types'
import { useAuth } from '../auth/useAuth'
import { AccountIcon } from '../components/AccountIcon'
import { CsvImport } from '../components/CsvImport'
import { transactionsToCsv } from '../csvExport'
import { readCsv, type CsvFile } from '../csvImport'
import { EditTransactionRow } from '../components/EditTransactionRow'
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
  // Sorted by date or amount, biggest (newest) first unless ?order=asc
  const sort = params.get('sort') === 'amount' ? 'amount' : 'date'
  const order = params.get('order') === 'asc' ? 'asc' : 'desc'
  // Sets address values together; '' removes one
  const setAddress = (values: Record<string, string>) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const [name, value] of Object.entries(values)) {
          if (value) next.set(name, value)
          else next.delete(name)
        }
        return next
      },
      { replace: true },
    )
  const setParam = (name: string, value: string) => setAddress({ [name]: value })
  // Clicking the sorted column flips the order; another column starts biggest (newest) first
  const sortBy = (column: 'date' | 'amount') =>
    column === sort
      ? setAddress({ order: order === 'asc' ? '' : 'asc' })
      : setAddress({ sort: column === 'amount' ? 'amount' : '', order: '' })
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
  // With one account there's nothing to tell apart
  const showAccount = accounts.length > 1
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name
  const accountType = (id: string) => accounts.find((a) => a.id === id)?.type
  const shown = (transactions ?? [])
    .filter((t) => !viewing || t.accountId === viewing || t.transferAccountId === viewing)
    .filter((t) => !categoryFilter || (categoryFilter === 'uncategorized' ? isUncategorized(t) : t.categoryId === categoryFilter))
  // The list comes newest first; by amount puts the biggest spending at the top
  if (sort === 'amount') shown.sort((a, b) => b.amountCents - a.amountCents)
  if (order === 'asc') shown.reverse()
  // The first transaction of its day in the list. Sorted by date, a line separates the days.
  const newDay = (i: number) => i === 0 || shown[i - 1].date !== shown[i].date
  const ariaOrder = order === 'asc' ? 'ascending' : 'descending'
  const arrow = order === 'asc' ? ' ↑' : ' ↓'
  const filterName =
    categoryFilter === 'uncategorized' ? 'uncategorized' : categories.find((c) => c.id === categoryFilter)?.name
  // Seen from the account a transfer went into, it's money coming in (like money back)
  const shownAmount = (t: Transaction) =>
    viewing && t.transferAccountId === viewing ? formatCents(-t.amountCents) : formatAmount(t)
  const names = { categories, accounts, incomeSources }

  // After a save, show the month the transaction belongs to, keeping the add form open there
  const showChange = (input: TransactionInput) => {
    setMonth(monthOf(input.date))
    setAddingMonth(monthOf(input.date))
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

  // Adding to another month is rare, so its add form stays tucked away until asked for.
  // This holds the month whose form was opened.
  const [addingMonth, setAddingMonth] = useState<string | null>(null)
  const isThisMonth = month === monthOf(today())
  const showAddForm = isThisMonth || addingMonth === month

  // Stop editing when the month changes
  const [editingMonth, setEditingMonth] = useState(month)
  if (editingMonth !== month) {
    setEditingMonth(month)
    setEditingId(null)
  }

  // Import and export, as small icon buttons beside the add form's heading
  const csvButtons = (
    <>
      <button
        type="button"
        className="button icon-button"
        aria-label="Import from CSV"
        title="Import from CSV"
        onClick={() => filePicker.current?.click()}
      >
        {/* An arrow down into a tray */}
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M10 3v9m-4-4 4 4 4-4M4 13v3h12v-3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        className="button icon-button"
        aria-label={exporting ? 'Exporting…' : 'Export to CSV'}
        title="Export to CSV"
        onClick={exportCsv}
        disabled={exporting}
      >
        {/* An arrow up out of a tray */}
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M10 12V3M6 7l4-4 4 4M4 13v3h12v-3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </>
  )

  return (
    <>
      <p className="page-intro page-intro-top">
        Add the money you spend, and refunds as negative amounts. For a paycheck, pick its income under Category.
        For paying off a card or saving into a fund, pick the account the money went to.
      </p>
      <input
        ref={filePicker}
        type="file"
        accept=".csv,text/csv"
        className="visually-hidden"
        aria-label="CSV file to import"
        tabIndex={-1}
        onChange={(e) => pickImportFile(e.target.files?.[0])}
      />

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
        showAddForm ? (
          <TransactionForm
            key={month}
            categories={categories}
            accounts={accounts}
            incomeSources={incomeSources}
            defaultDate={isThisMonth ? today() : `${month}-01`}
            onSave={add}
            onClose={isThisMonth ? undefined : () => setAddingMonth(null)}
            actions={csvButtons}
          />
        ) : (
          <div className="card add-collapsed">
            <button type="button" className="link-button" onClick={() => setAddingMonth(month)}>
              + Add a transaction to {formatMonth(month)}
            </button>
            <div className="page-actions">{csvButtons}</div>
          </div>
        )
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <section className="card" aria-label={`Transactions in ${formatMonth(month)}`}>
        {transactions === null ? (
          <p className="muted">Loading…</p>
        ) : transactions.length === 0 ? (
          <p className="muted">No transactions in {formatMonth(month)} yet.</p>
        ) : (
          <div className="table-scroll">
            <table className="table table-navy transactions-table">
              <thead>
                <tr>
                  <th scope="col" aria-sort={sort === 'date' ? ariaOrder : undefined}>
                    <button type="button" className="sort-button" onClick={() => sortBy('date')}>
                      Date{sort === 'date' && <span aria-hidden="true">{arrow}</span>}
                    </button>
                  </th>
                  <th scope="col">Description</th>
                  {showAccount && (
                    <th scope="col">
                      <select
                        className="header-filter"
                        aria-label="Filter by account"
                        value={viewing}
                        onChange={(e) => setAccountFilter(e.target.value)}
                      >
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
                    </th>
                  )}
                  <th scope="col">
                    <select
                      className="header-filter"
                      aria-label="Filter by category"
                      value={categoryFilter}
                      onChange={(e) => setParam('category', e.target.value)}
                    >
                      <option value="">All categories</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                      <option value="uncategorized">Uncategorized</option>
                    </select>
                  </th>
                  <th scope="col" className="amount" aria-sort={sort === 'amount' ? ariaOrder : undefined}>
                    <button type="button" className="sort-button" onClick={() => sortBy('amount')}>
                      Amount{sort === 'amount' && <span aria-hidden="true">{arrow}</span>}
                    </button>
                  </th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={showAccount ? 6 : 5} className="muted">
                      No {filterName ? `${filterName} ` : ''}transactions {viewing ? `for ${accountName(viewing)} ` : ''}in{' '}
                      {formatMonth(month)}.
                    </td>
                  </tr>
                )}
                {shown.map((transaction, i) =>
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
                    <tr key={transaction.id} className={sort === 'date' && i > 0 && newDay(i) ? 'day-start' : undefined}>
                      <td className="transaction-date">
                        {/* Newest first, each day's date shows once; screen readers still hear it on every row */}
                        {newDay(i) || sort !== 'date' ? (
                          formatDay(transaction.date)
                        ) : (
                          <span className="visually-hidden">{formatDay(transaction.date)}</span>
                        )}
                      </td>
                      <td>{transaction.description}</td>
                      {showAccount && (
                        <td>
                          <span className="with-icon">
                            {accountType(transaction.accountId) && <AccountIcon type={accountType(transaction.accountId)!} />}
                            {accountName(transaction.accountId)}
                          </span>
                        </td>
                      )}
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
