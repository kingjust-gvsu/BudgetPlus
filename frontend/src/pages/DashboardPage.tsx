import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { apiGet } from '../api/client'
import type { BillStatus, CategorySummary, ExpenseStatus, FundBillStatus, MonthSummary } from '../api/types'
import { useAuth } from '../auth/useAuth'
import { formatLongDate } from '../budgetText'
import { ProgressBar } from '../components/ProgressBar'
import { formatMonth, monthOf, shiftMonth, today } from '../dates'
import { formatCents } from '../money'
import './DashboardPage.css'

type Expense = CategorySummary & ExpenseStatus
type Bill = CategorySummary & BillStatus
type FundBill = CategorySummary & FundBillStatus

// "+$25.00" / "-$14.00"
const signed = (cents: number) => (cents > 0 ? `+${formatCents(cents)}` : formatCents(cents))

function ExpenseRow({ expense }: { expense: Expense }) {
  const { limitCents, spentCents, leftCents, state } = expense
  const name = expense.budgetType === 'REMAINDER' ? `${expense.name} (remainder)` : expense.name
  return (
    <li className="dash-row">
      <div className="dash-row-line">
        <span className="dash-row-name">{name}</span>
        <span>{limitCents === null ? formatCents(spentCents) : `${formatCents(spentCents)} of ${formatCents(limitCents)}`}</span>
      </div>
      {state !== 'noLimit' && limitCents !== null && (
        <ProgressBar percent={limitCents === 0 ? 100 : (spentCents / limitCents) * 100} tone={state === 'over' ? 'bad' : 'good'} />
      )}
      <div className={`dash-row-note dash-row-note--${state}`}>
        {state === 'noLimit' ? 'No limit set' : state === 'over' ? `${formatCents(-(leftCents ?? 0))} over` : `${formatCents(leftCents ?? 0)} left`}
      </div>
    </li>
  )
}

function BillRow({ bill }: { bill: Bill }) {
  return (
    <li className="dash-bill">
      <span>
        {bill.name} <span className="muted small">· {bill.state === 'paid' ? 'Paid' : 'Pending'}</span>
      </span>
      <span>
        {bill.state === 'paid' && formatCents(bill.paidCents)}
        {bill.estimateCents !== null && (
          <span className="muted small">
            {bill.state === 'paid' ? ' ' : ''}est. {formatCents(bill.estimateCents)}
          </span>
        )}
        {bill.state === 'pending' && bill.estimateCents === null && <span className="muted small">No estimate</span>}
      </span>
    </li>
  )
}

function FundRow({ bill }: { bill: FundBill }) {
  const fund = bill.fund
  if (!fund || bill.targetCents === null) {
    return (
      <li className="dash-row">
        <span className="dash-row-name">{bill.name}</span>
        <div className="dash-row-note muted">Add its amount and next due date on Budget setup to start saving.</div>
      </li>
    )
  }
  return (
    <li className="dash-row">
      <div className="dash-row-line">
        <span className="dash-row-name">{bill.name}</span>
        <span>
          {formatCents(fund.balanceCents)} of {formatCents(bill.targetCents)} saved
        </span>
      </div>
      <ProgressBar percent={bill.targetCents === 0 ? 100 : (fund.balanceCents / bill.targetCents) * 100} tone="neutral" />
      <div className="dash-row-note muted">
        Due {formatLongDate(fund.nextDueDate)} · {formatCents(fund.setAsideCents)} set aside this month
        {fund.paidCents !== 0 && ` · paid ${formatCents(fund.paidCents)} from the fund`}
      </div>
    </li>
  )
}

export function DashboardPage() {
  const { getToken } = useAuth()
  const [month, setMonth] = useState(monthOf(today()))
  const [summary, setSummary] = useState<MonthSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    getToken()
      .then((token) => apiGet<MonthSummary>(`/summary?month=${month}`, token))
      .then((loaded) => {
        if (!current) return
        setSummary(loaded)
        setError(null)
      })
      .catch(() => {
        if (current) setError("Couldn't load this month. Please refresh the page.")
      })
    return () => {
      current = false
    }
  }, [getToken, month])

  const expenses = (summary?.categories.filter((c) => c.type === 'expense') ?? []) as Expense[]
  const bills = (summary?.categories.filter((c) => c.type === 'bill') ?? []) as Bill[]
  const fundBills = (summary?.categories.filter((c) => c.type === 'fundBill') ?? []) as FundBill[]
  const remainder = expenses.find((c) => c.budgetType === 'REMAINDER')

  return (
    <>
      <div className="page-header">
        <h1>{formatMonth(month)}</h1>
        <div className="month-nav">
          <button type="button" className="button" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>
            ‹
          </button>
          <button type="button" className="button" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>
            ›
          </button>
        </div>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {!summary ? (
        !error && <p className="muted">Loading…</p>
      ) : summary.categories.length === 0 ? (
        <section className="card dash-empty">
          <h2>Set up your budget</h2>
          <p className="muted">Add your income, bills, and expenses to see your month here.</p>
          <Link to="/budget-setup" className="button button-primary">
            Go to Budget setup
          </Link>
        </section>
      ) : (
        <>
          {summary.incomeCents === null && (
            <p className="dash-notice">
              Add your monthly income on <Link to="/budget-setup">Budget setup</Link> to see percent budgets and your
              remainder.
            </p>
          )}
          {summary.overPlannedCents > 0 && (
            <p className="dash-notice dash-notice--warning" role="status">
              Your budgets add up to {formatCents(summary.overPlannedCents)} more than your income.{' '}
              <Link to="/budget-setup">Adjust them</Link>
            </p>
          )}

          <section className="dash-tiles" aria-label="Month summary">
            <div className="dash-tile">
              <div className="dash-tile-label">Income</div>
              <div className="dash-tile-value">{summary.incomeCents === null ? 'Not set' : formatCents(summary.incomeCents)}</div>
              <div className="dash-tile-note">estimated</div>
            </div>
            <div className="dash-tile">
              <div className="dash-tile-label">Bills</div>
              <div className="dash-tile-value">{formatCents(summary.totals.billsPaidCents)}</div>
              <div className="dash-tile-note">
                of {formatCents(summary.totals.billsPlannedCents)} planned · {summary.totals.monthlyBillsPaid} of{' '}
                {summary.totals.monthlyBills} paid
              </div>
            </div>
            <div className="dash-tile">
              <div className="dash-tile-label">Expenses</div>
              <div className="dash-tile-value">{formatCents(summary.totals.expensesSpentCents)}</div>
              <div className="dash-tile-note">of {formatCents(summary.totals.expensesLimitCents)} in limits</div>
            </div>
            <div className="dash-tile">
              <div className="dash-tile-label">{remainder ? `${remainder.name} (remainder)` : 'Remainder'}</div>
              <div className="dash-tile-value">{summary.remainderCents === null ? '—' : formatCents(summary.remainderCents)}</div>
              <div className="dash-tile-note">
                {!remainder
                  ? 'No remainder category'
                  : summary.billDifferenceCents !== 0
                    ? `${signed(-summary.billDifferenceCents)} from bills`
                    : "what's left after everything else"}
              </div>
            </div>
          </section>

          <div className="dash-columns">
            <section className="card dash-main" aria-labelledby="expenses-heading">
              <h2 id="expenses-heading">Expenses</h2>
              {expenses.length === 0 ? (
                <p className="muted">No expense categories yet.</p>
              ) : (
                <ul className="dash-list">
                  {expenses.map((expense) => (
                    <ExpenseRow key={expense.id} expense={expense} />
                  ))}
                </ul>
              )}
              {summary.uncategorizedCents !== 0 && (
                <p className="muted small dash-uncategorized">
                  {formatCents(summary.uncategorizedCents)} of spending isn't in a category yet.{' '}
                  <Link to="/transactions">Review transactions</Link>
                </p>
              )}
            </section>

            <div className="dash-side">
              <section className="card" aria-labelledby="bills-heading">
                <h2 id="bills-heading">Bills</h2>
                {bills.length === 0 ? (
                  <p className="muted">No monthly bills yet.</p>
                ) : (
                  <ul className="dash-bills">
                    {bills.map((bill) => (
                      <BillRow key={bill.id} bill={bill} />
                    ))}
                  </ul>
                )}
              </section>

              {fundBills.length > 0 && (
                <section className="card" aria-labelledby="funds-heading">
                  <h2 id="funds-heading">Upcoming big bills</h2>
                  <ul className="dash-list">
                    {fundBills.map((bill) => (
                      <FundRow key={bill.id} bill={bill} />
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}
