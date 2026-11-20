import { useState } from 'react'
import type { MonthSpending } from '../api/types'
import { monthAxisLabels, niceScale } from '../charts'
import { formatMonth } from '../dates'
import { formatCents } from '../money'
import './charts.css'

const wholeDollars = (cents: number) => formatCents(cents).replace(/\.00$/, '')

// A refund-heavy month can total below zero; the bars start at zero
const positive = (cents: number) => Math.max(0, cents)

type Props = {
  // Each month's income (when set) is drawn as a dashed line, and each month says how far under or
  // over it spending was
  months: MonthSpending[]
  height?: number
}

// "$420 left" or "$180 over", compared with income
function vsIncome(totalCents: number, incomeCents: number) {
  const left = incomeCents - totalCents
  return left >= 0 ? `${wholeDollars(left)} left` : `${wholeDollars(-left)} over`
}

// A stacked bar for each month: bills on the bottom, expenses on top
export function MonthlySpendingChart({ months, height = 220 }: Props) {
  const [hovered, setHovered] = useState<string | null>(null)
  const incomeOf = (m: MonthSpending) => (m.incomeCents && m.incomeCents > 0 ? m.incomeCents : null)
  const incomes = months.map(incomeOf).filter((c): c is number => c !== null)
  const hasIncome = incomes.length > 0
  // The legend names the amount only when it's the same every month
  const steadyIncome = hasIncome && incomes.length === months.length && incomes.every((c) => c === incomes[0]) ? incomes[0] : null
  const biggest = Math.max(0, ...incomes, ...months.map((m) => positive(m.billsCents) + positive(m.expensesCents)))
  const { top: max, step } = niceScale(biggest)
  const ticks = Math.round(max / step)
  const percent = (cents: number) => `${(positive(cents) / max) * 100}%`
  // With many months, label fewer of them and leave the under/over notes to the tooltip
  const labels = monthAxisLabels(months.map((m) => m.month))
  const byYear = months.length > 18
  const showStatus = months.length <= 12

  return (
    <figure className="chart">
      <div className="chart-legend" aria-hidden="true">
        <span className="chart-key">
          <span className="chart-swatch chart-swatch--bills" /> Bills
        </span>
        <span className="chart-key">
          <span className="chart-swatch chart-swatch--expenses" /> Expenses
        </span>
        {hasIncome && (
          <span className="chart-key">
            <span className="chart-swatch-line" /> Income{steadyIncome !== null && ` ${wholeDollars(steadyIncome)}`}
          </span>
        )}
      </div>

      <div className="month-chart" style={{ height }} aria-hidden="true">
        {Array.from({ length: ticks + 1 }, (_, i) => (
          <div key={i} className="month-chart-grid" style={{ bottom: `${(i / ticks) * 100}%` }}>
            <span className="month-chart-tick">{wholeDollars(step * i)}</span>
          </div>
        ))}

        <div className="month-chart-bars">
          {months.map((m, i) => {
            const total = m.billsCents + m.expensesCents
            const income = incomeOf(m)
            return (
              <div
                key={m.month}
                className={byYear && i > 0 && m.month.endsWith('-01') ? 'month-chart-column year-start' : 'month-chart-column'}
                onPointerEnter={() => setHovered(m.month)}
                onPointerLeave={() => setHovered(null)}
              >
                <div className="month-chart-stack">
                  {m.expensesCents > 0 && (
                    <div className="month-chart-segment chart-fill--expenses" style={{ height: percent(m.expensesCents) }} />
                  )}
                  {m.billsCents > 0 && (
                    <div className="month-chart-segment chart-fill--bills" style={{ height: percent(m.billsCents) }} />
                  )}
                </div>
                {income !== null && <div className="month-chart-income" style={{ bottom: percent(income) }} />}
                {hovered === m.month && (
                  <div className="chart-tooltip">
                    <strong>{formatMonth(m.month)}</strong>
                    <span>
                      <span className="chart-swatch chart-swatch--bills" /> Bills {formatCents(m.billsCents)}
                    </span>
                    <span>
                      <span className="chart-swatch chart-swatch--expenses" /> Expenses {formatCents(m.expensesCents)}
                    </span>
                    <span className="chart-tooltip-total">Total {formatCents(total)}</span>
                    {income !== null && (
                      <span>
                        Income {formatCents(income)} · {vsIncome(total, income)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

      </div>

      <div
        className={`month-chart-labels${byYear ? ' by-year' : ''}${months.length > 6 ? ' many' : ''}`}
        aria-hidden="true"
      >
        {months.map((m, i) => {
          const total = m.billsCents + m.expensesCents
          const income = incomeOf(m)
          const over = income !== null && total > income
          return (
            <span key={m.month}>
              {labels[i]}
              {showStatus && income !== null && total > 0 && (
                <span className={over ? 'month-chart-status bad' : 'month-chart-status good'}>
                  <span>
                    {over ? '▲' : '▼'} {wholeDollars(Math.abs(income - total))}
                  </span>
                  <span>{over ? 'over' : 'left'}</span>
                </span>
              )}
            </span>
          )
        })}
      </div>

      {/* The same numbers for screen readers */}
      <table className="visually-hidden">
        <caption>Spending by month</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Bills</th>
            <th scope="col">Expenses</th>
            <th scope="col">Total</th>
            {hasIncome && <th scope="col">Income</th>}
            {hasIncome && <th scope="col">Compared with income</th>}
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.month}>
              <th scope="row">{formatMonth(m.month)}</th>
              <td>{formatCents(m.billsCents)}</td>
              <td>{formatCents(m.expensesCents)}</td>
              <td>{formatCents(m.billsCents + m.expensesCents)}</td>
              {hasIncome && <td>{incomeOf(m) === null ? 'Not set' : formatCents(incomeOf(m)!)}</td>}
              {hasIncome && <td>{incomeOf(m) === null ? '' : vsIncome(m.billsCents + m.expensesCents, incomeOf(m)!)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
