import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { apiGet } from '../api/client'
import type { BillStatus, CategorySummary, FundBillStatus, MonthSummary } from '../api/types'
import { useAuth } from '../auth/useAuth'
import { formatLongDate } from '../budgetText'
import { ProgressBar } from '../components/ProgressBar'
import { formatMonth, monthOf, shiftMonth, today } from '../dates'
import { formatCents } from '../money'
import './BillsPage.css'

type Bill = CategorySummary & BillStatus
type FundBill = CategorySummary & FundBillStatus

// "every 6 months", "yearly"
const howOften = (months: number) => (months === 12 ? 'yearly' : `every ${months} months`)

// Actual minus estimate: "+$14.00" when a bill came in higher, "−$28.75" when lower
function differenceText(bill: Bill) {
  if (bill.state === 'pending' || bill.estimateCents === null || bill.differenceCents === 0) return '—'
  const amount = formatCents(Math.abs(bill.differenceCents))
  return bill.differenceCents > 0 ? `+${amount}` : `−${amount}`
}

function FundCard({ bill }: { bill: FundBill }) {
  const fund = bill.fund
  return (
    <div className="fund-card">
      <div className="fund-card-top">
        <strong>{bill.name}</strong>
        <span className="muted small">{howOften(bill.frequencyMonths)}</span>
      </div>
      {!fund || bill.targetCents === null ? (
        <p className="muted small fund-card-setup">
          Add its amount and next due date on <Link to="/budget-setup">Budget setup</Link> to start saving.
        </p>
      ) : (
        <>
          <div className="fund-card-amount">
            {formatCents(fund.balanceCents)} <span className="muted">of {formatCents(bill.targetCents)} saved</span>
          </div>
          <ProgressBar percent={bill.targetCents === 0 ? 100 : (fund.balanceCents / bill.targetCents) * 100} tone="neutral" />
          <p className="muted small fund-card-note">
            Due {formatLongDate(fund.nextDueDate)} · {formatCents(fund.setAsideCents)} set aside this month
          </p>
          {fund.paidCents !== 0 && (
            <p className="small fund-card-note">Paid {formatCents(fund.paidCents)} from the fund this month.</p>
          )}
        </>
      )}
    </div>
  )
}

export function BillsPage() {
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
        if (current) setError("Couldn't load your bills. Please refresh the page.")
      })
    return () => {
      current = false
    }
  }, [getToken, month])

  const bills = (summary?.categories.filter((c) => c.type === 'bill') ?? []) as Bill[]
  const fundBills = (summary?.categories.filter((c) => c.type === 'fundBill') ?? []) as FundBill[]
  const estimateTotal = bills.reduce((sum, bill) => sum + (bill.estimateCents ?? 0), 0)
  const paidTotal = bills.reduce((sum, bill) => sum + bill.paidCents, 0)

  return (
    <>
      <div className="page-header">
        <h1>Bills &amp; funds</h1>
        <div className="month-nav">
          <button type="button" className="button" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>
            ‹
          </button>
          <span className="month-name">{formatMonth(month)}</span>
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
      ) : (
        <>
          <section className="card" aria-labelledby="monthly-bills-heading">
            <h2 id="monthly-bills-heading">This month’s bills</h2>
            {bills.length === 0 ? (
              <p className="muted">
                No monthly bills yet. Add them on <Link to="/budget-setup">Budget setup</Link>.
              </p>
            ) : (
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Bill</th>
                      <th scope="col">Status</th>
                      <th scope="col" className="amount">
                        Estimate
                      </th>
                      <th scope="col" className="amount">
                        Actual
                      </th>
                      <th scope="col" className="amount">
                        Difference
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {bills.map((bill) => (
                      <tr key={bill.id}>
                        <td>{bill.name}</td>
                        <td>{bill.state === 'paid' ? 'Paid' : <span className="muted">Pending</span>}</td>
                        <td className="amount">{bill.estimateCents === null ? <span className="muted">—</span> : formatCents(bill.estimateCents)}</td>
                        <td className="amount">{bill.state === 'paid' ? formatCents(bill.paidCents) : <span className="muted">—</span>}</td>
                        <td className="amount muted">{differenceText(bill)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row" colSpan={2}>
                        Total
                      </th>
                      <td className="amount">{formatCents(estimateTotal)}</td>
                      <td className="amount">{formatCents(paidTotal)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

          <section className="card" aria-labelledby="fund-bills-heading">
            <h2 id="fund-bills-heading">Bills that aren’t monthly</h2>
            <div className="fund-cards">
              {fundBills.map((bill) => (
                <FundCard key={bill.id} bill={bill} />
              ))}
              <Link to="/budget-setup" className="fund-card fund-card-add">
                + Add a non-monthly bill
              </Link>
            </div>
          </section>
        </>
      )}
    </>
  )
}
