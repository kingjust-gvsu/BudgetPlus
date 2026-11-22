import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { apiGet } from '../api/client'
import type { BillStatus, CategorySummary, ExpenseStatus, FundBillStatus, IncomeSummary, MonthSummary, SpendingSummary } from '../api/types'
import { useAuth } from '../auth/useAuth'
import { formatLongDate } from '../budgetText'
import { CategoryDonut } from '../components/CategoryDonut'
import { ProgressBar } from '../components/ProgressBar'
import { monthOf, today } from '../dates'
import { formatCents } from '../money'
import { useMonth } from '../useMonth'
import './DashboardPage.css'

type Expense = CategorySummary & ExpenseStatus
type Bill = CategorySummary & BillStatus
type FundBill = CategorySummary & FundBillStatus

// "+$25.00" / "-$14.00"
const signed = (cents: number) => (cents > 0 ? `+${formatCents(cents)}` : formatCents(cents))

// Within this share of a limit, an expense is shown as near it
const NEAR_LIMIT = 0.9

// The month's transactions in one category, biggest first
const transactionsLink = (month: string, category: string) => `/transactions?month=${month}&category=${category}&sort=amount`

// under, near, over, or noLimit
function expenseState({ state, limitCents, spentCents }: Expense) {
  const near = state === 'under' && limitCents !== null && limitCents > 0 && spentCents >= limitCents * NEAR_LIMIT
  return near ? 'near' : state
}

// "Internet", "Internet and Phone", "Internet, Phone, and Water"
function listNames(names: string[]) {
  if (names.length <= 2) return names.join(' and ')
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}

// How far into the month today is; null when looking at another month
function monthProgress(month: string) {
  const now = today()
  if (monthOf(now) !== month) return null
  const [year, monthNumber] = month.split('-').map(Number)
  const days = new Date(year, monthNumber, 0).getDate()
  const day = Number(now.slice(8, 10))
  return { day, days, daysLeft: days - day + 1 }
}

// The headline: how much is left under the expense limits, and how the month is going
function LeftToSpend({ summary, children }: { summary: MonthSummary; children: ReactNode }) {
  const { expensesLimitCents: limit, expensesSpentCents: spent } = summary.totals
  const left = limit - spent
  const progress = monthProgress(summary.month)
  return (
    <div className="dash-hero">
      <section className="dash-hero-main" aria-label="Left to spend">
          <div className="dash-hero-label">{left < 0 ? 'Over your limits' : 'Left to spend'}</div>
          <div className="dash-hero-value">{formatCents(Math.abs(left))}</div>
          {progress && left > 0 && (
            <div className="dash-hero-note">
              {progress.daysLeft} {progress.daysLeft === 1 ? 'day' : 'days'} left · about{' '}
              {formatCents(Math.floor(left / progress.daysLeft))} a day
            </div>
          )}
        {limit > 0 && (
          <div className="dash-hero-pace">
            <div className="dash-hero-bar">
              <ProgressBar percent={(spent / limit) * 100} tone={left < 0 ? 'bad' : spent >= limit * NEAR_LIMIT ? 'warn' : 'good'} />
              {progress && <span className="dash-hero-today" style={{ left: `${(progress.day / progress.days) * 100}%` }} aria-hidden="true" />}
            </div>
            <div className="dash-hero-pace-text">
              <span>
                {formatCents(spent)} of {formatCents(limit)} spent
              </span>
              {progress && (
                <span>
                  Day {progress.day} of {progress.days}
                </span>
              )}
            </div>
          </div>
        )}
      </section>
      {children}
    </div>
  )
}

// Expenses over or near their limit, and bills still unpaid. Left out when there's nothing.
function NeedsAttention({ expenses, bills, month }: { expenses: Expense[]; bills: Bill[]; month: string }) {
  const over = expenses.filter((e) => expenseState(e) === 'over')
  const near = expenses.filter((e) => expenseState(e) === 'near')
  // A future month's bills aren't due yet
  const unpaid = month <= monthOf(today()) ? bills.filter((b) => b.state === 'pending') : []
  if (over.length + near.length + unpaid.length === 0) return null
  const unpaidEstimate = unpaid.reduce((sum, b) => sum + (b.estimateCents ?? 0), 0)
  return (
    <ul className="dash-attention" aria-label="Needs attention">
      {over.map((e) => (
        <li key={e.id} className="dash-alert dash-alert--bad">
          <Link to={transactionsLink(month, e.id)}>
            {e.name} is {formatCents(-(e.leftCents ?? 0))} over
          </Link>
        </li>
      ))}
      {near.map((e) => (
        <li key={e.id} className="dash-alert dash-alert--warn">
          <Link to={transactionsLink(month, e.id)}>
            {e.name} has {formatCents(e.leftCents ?? 0)} left
          </Link>
        </li>
      ))}
      {unpaid.length > 0 && (
        <li className="dash-alert">
          <span>
            {unpaid.length > 3 ? `${unpaid.length} bills` : listNames(unpaid.map((b) => b.name))} not paid yet
            {unpaidEstimate > 0 && <span className="muted"> · est. {formatCents(unpaidEstimate)}</span>}
          </span>
        </li>
      )}
    </ul>
  )
}

function ExpenseRow({ expense, month }: { expense: Expense; month: string }) {
  const { limitCents, spentCents, leftCents } = expense
  const state = expenseState(expense)
  const name = expense.budgetType === 'REMAINDER' ? `${expense.name} (remainder)` : expense.name
  return (
    <li className="dash-row">
      <div className="dash-row-line">
        <Link to={transactionsLink(month, expense.id)} className="dash-row-name">
          {name}
        </Link>
        <span>{limitCents === null ? formatCents(spentCents) : `${formatCents(spentCents)} of ${formatCents(limitCents)}`}</span>
      </div>
      {state !== 'noLimit' && limitCents !== null && (
        <ProgressBar
          percent={limitCents === 0 ? 100 : (spentCents / limitCents) * 100}
          tone={state === 'over' ? 'bad' : state === 'near' ? 'warn' : 'good'}
        />
      )}
      <div className={`dash-row-note dash-row-note--${state}`}>
        {state === 'noLimit'
          ? 'No limit set'
          : state === 'over'
            ? `${formatCents(-(leftCents ?? 0))} over`
            : state === 'near'
              ? `${formatCents(leftCents ?? 0)} left · near the limit`
              : `${formatCents(leftCents ?? 0)} left`}
      </div>
    </li>
  )
}

function BillRow({ bill }: { bill: Bill }) {
  const paid = bill.state === 'paid'
  return (
    <li className="dash-bill">
      <span className="dash-bill-name">
        <span className={paid ? 'dash-check dash-check--paid' : 'dash-check'} aria-hidden="true">
          {paid ? '✓' : '○'}
        </span>
        {bill.name}
        <span className="visually-hidden">{paid ? ', paid' : ', not paid yet'}</span>
      </span>
      <span className={paid ? undefined : 'muted'}>
        {paid
          ? formatCents(bill.paidCents)
          : bill.estimateCents === null
            ? 'No estimate'
            : `est. ${formatCents(bill.estimateCents)}`}
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

// Each income source's plan for the month next to what has come in, plus other income
function IncomeCard({ income }: { income: IncomeSummary }) {
  const rows = [
    ...income.sources.map((s) => ({ key: s.id, name: s.name, plannedCents: s.plannedCents, receivedCents: s.receivedCents })),
    { key: 'other', name: 'Other', ...income.other },
  ].filter((row) => row.key !== 'other' || row.plannedCents !== 0 || row.receivedCents !== 0)
  return (
    <section className="card" aria-labelledby="income-heading">
      <h2 id="income-heading">Income</h2>
      <ul className="dash-income">
        {rows.map((row) => (
          <li key={row.key} className="dash-income-row">
            <span className="dash-income-name">{row.name}</span>
            <span className="dash-income-amount">
              {formatCents(row.receivedCents)}
              <span className="muted"> of {formatCents(row.plannedCents)}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="muted small">
        Received so far this month. Add paychecks on <Link to="/transactions">Transactions</Link> with their income as
        the category.
      </p>
    </section>
  )
}

// How the month's spending splits across categories. Left out if there's nothing to show.
function SpendingSplitCard({ month }: { month: string }) {
  const { getToken } = useAuth()
  const [spending, setSpending] = useState<SpendingSummary | null>(null)

  useEffect(() => {
    let current = true
    getToken()
      .then((token) => apiGet<SpendingSummary>(`/spending?to=${month}&months=1`, token))
      .then((loaded) => {
        if (current) setSpending(loaded)
      })
      .catch(() => {
        if (current) setSpending(null)
      })
    return () => {
      current = false
    }
  }, [getToken, month])

  if (!spending?.categories?.length) return null
  return (
    <section className="card" aria-labelledby="split-heading">
      <div className="dash-card-top">
        <h2 id="split-heading">Spending</h2>
        <Link to="/trends">See trends</Link>
      </div>
      <CategoryDonut categories={spending.categories} />
    </section>
  )
}

export function DashboardPage() {
  const { getToken } = useAuth()
  const [month] = useMonth()
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
  // Most of its limit used first, so problems come to the top; no limit and the remainder go last
  const used = (e: Expense) =>
    e.budgetType === 'REMAINDER' || e.limitCents === null ? -1 : e.limitCents === 0 ? Infinity : e.spentCents / e.limitCents
  const sortedExpenses = [...expenses].sort((a, b) => used(b) - used(a))

  return (
    <>
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

          <LeftToSpend summary={summary}>
            <section className="dash-tiles" aria-label="Month summary">
              <div className="dash-tile">
                <div className="dash-tile-label">Income</div>
                <div className="dash-tile-value">{formatCents(summary.income.receivedCents)}</div>
                <div className="dash-tile-note">
                  {summary.incomeCents === null ? 'no plan set' : `of ${formatCents(summary.incomeCents)} planned`}
                </div>
              </div>
              <div className="dash-tile">
                <div className="dash-tile-label">Bills</div>
                <div className="dash-tile-value">
                  {summary.totals.monthlyBillsPaid} of {summary.totals.monthlyBills} paid
                </div>
                <div className="dash-tile-note">
                  {formatCents(summary.totals.billsPaidCents)} of {formatCents(summary.totals.billsPlannedCents)}
                </div>
              </div>
              <div className="dash-tile">
                <div className="dash-tile-label">{remainder ? `${remainder.name} (remainder)` : 'Remainder'}</div>
                <div className="dash-tile-value">{summary.remainderCents === null ? '—' : formatCents(summary.remainderCents)}</div>
                <div className="dash-tile-note">
                  {!remainder
                    ? 'No remainder category'
                    : summary.billDifferenceCents !== 0
                      ? `${signed(-summary.billDifferenceCents)} from bills`
                      : 'after bills and expenses'}
                </div>
              </div>
            </section>
          </LeftToSpend>

          <NeedsAttention expenses={expenses} bills={bills} month={summary.month} />

          <div className="dash-columns">
            <section className="card dash-main" aria-labelledby="expenses-heading">
              <h2 id="expenses-heading">Expenses</h2>
              {expenses.length === 0 ? (
                <p className="muted">No expense categories yet.</p>
              ) : (
                <ul className="dash-list">
                  {sortedExpenses.map((expense) => (
                    <ExpenseRow key={expense.id} expense={expense} month={summary.month} />
                  ))}
                </ul>
              )}
              {summary.uncategorizedCents !== 0 && (
                <p className="muted small dash-uncategorized">
                  {formatCents(summary.uncategorizedCents)} of spending isn't in a category yet.{' '}
                  <Link to={`/transactions?month=${summary.month}&category=uncategorized`}>Review transactions</Link>
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

              <SpendingSplitCard month={month} />

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

              {(summary.income.sources.length > 0 || summary.income.receivedCents !== 0) && <IncomeCard income={summary.income} />}
            </div>
          </div>

        </>
      )}
    </>
  )
}
