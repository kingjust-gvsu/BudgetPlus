import { useEffect, useState } from 'react'
import { apiGet, apiSend } from '../api/client'
import type { Category, Transaction, TransactionInput } from '../api/types'
import { useAuth } from '../auth/useAuth'
import { EditTransactionRow } from '../components/EditTransactionRow'
import { TransactionForm } from '../components/TransactionForm'
import { formatDay, formatMonth, monthOf, shiftMonth, today } from '../dates'
import { formatCents } from '../money'

export function TransactionsPage() {
  const { getToken } = useAuth()
  const [month, setMonth] = useState(monthOf(today()))
  const [transactions, setTransactions] = useState<Transaction[] | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Bumped after a change, so the list reloads even when the month stays the same
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let current = true
    getToken()
      .then((token) =>
        Promise.all([
          apiGet<Transaction[]>(`/transactions?month=${month}`, token),
          apiGet<Category[]>('/categories', token),
        ]),
      )
      .then(([loadedTransactions, loadedCategories]) => {
        if (!current) return
        setTransactions(loadedTransactions)
        setCategories(loadedCategories)
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

  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name

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

  const changeMonth = (by: number) => {
    setEditingId(null)
    setMonth(shiftMonth(month, by))
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Transactions</h1>
          <p className="page-intro">Add the money you spend, and refunds as negative amounts.</p>
        </div>
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

      <TransactionForm categories={categories} onSave={add} />

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
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Description</th>
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
                {transactions.map((transaction) =>
                  transaction.id === editingId ? (
                    <EditTransactionRow
                      key={transaction.id}
                      transaction={transaction}
                      categories={categories}
                      onSave={(input) => update(transaction.id, input)}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <tr key={transaction.id}>
                      <td>{formatDay(transaction.date)}</td>
                      <td>{transaction.description}</td>
                      <td>{categoryName(transaction.categoryId) ?? <span className="muted">Uncategorized</span>}</td>
                      <td className="amount">{formatCents(transaction.amountCents)}</td>
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
