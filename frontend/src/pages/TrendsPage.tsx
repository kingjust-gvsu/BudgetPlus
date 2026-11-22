import { useEffect, useState } from 'react'
import { apiGet } from '../api/client'
import type { SpendingSummary } from '../api/types'
import { useAuth } from '../auth/useAuth'
import { CategoryTrends } from '../components/CategoryTrends'
import { MonthlySpendingChart } from '../components/MonthlySpendingChart'
import { monthOf, today } from '../dates'
import './TrendsPage.css'

type Range = number | 'all'
const RANGES: Range[] = [3, 6, 12, 'all']

export function TrendsPage() {
  const { getToken } = useAuth()
  const [range, setRange] = useState<Range>(6)
  const [spending, setSpending] = useState<SpendingSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    getToken()
      .then((token) => apiGet<SpendingSummary>(`/spending?to=${monthOf(today())}&months=${range}`, token))
      .then((loaded) => {
        if (!current) return
        setSpending(loaded)
        setError(null)
      })
      .catch(() => {
        if (current) setError("Couldn't load your spending. Please refresh the page.")
      })
    return () => {
      current = false
    }
  }, [getToken, range])

  const total = spending?.months.reduce((sum, m) => sum + m.billsCents + m.expensesCents, 0) ?? 0

  return (
    <>
      <div className="page-header">
        <h1>Trends</h1>
        <div className="range-toggle" role="group" aria-label="Time range">
          {RANGES.map((option) => (
            <button
              key={option}
              type="button"
              className="button"
              aria-pressed={option === range}
              onClick={() => setRange(option)}
            >
              {option === 'all' ? 'All' : `${option} months`}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {!spending ? (
        !error && <p className="muted">Loading…</p>
      ) : total === 0 ? (
        <section className="card">
          <p className="muted">No spending to show yet.</p>
        </section>
      ) : (
        <>
          <section className="card" aria-labelledby="by-month-heading">
            <h2 id="by-month-heading">Spending by month</h2>
            <MonthlySpendingChart months={spending.months} />
          </section>
          <section className="card" aria-labelledby="by-category-heading">
            <h2 id="by-category-heading">By category</h2>
            <CategoryTrends categories={spending.categories} months={spending.months} />
          </section>
        </>
      )}
    </>
  )
}
