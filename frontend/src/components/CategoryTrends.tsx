import { useState } from 'react'
import { Link } from 'react-router'
import type { CategorySpending, MonthSpending } from '../api/types'
import { niceScale } from '../charts'
import { formatMonth, formatShortMonth } from '../dates'
import { formatCents } from '../money'
import './charts.css'

const wholeDollars = (cents: number) => formatCents(cents).replace(/\.00$/, '')
const kindClass = (kind: CategorySpending['kind']) => (kind === 'BILL' ? 'bills' : kind === 'EXPENSE' ? 'expenses' : 'other')

// That month's transactions in the category, biggest first
const transactionsLink = (category: CategorySpending, month: string) =>
  `/transactions?month=${month}&category=${category.id ?? 'uncategorized'}&sort=amount`

const WIDTH = 100 // the line is drawn in a 100 × 100 box and stretched to fit
const HEIGHT = 100

// One small line chart: what a category cost each month
function CategoryTrend({ category, months }: { category: CategorySpending; months: string[] }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const values = category.byMonthCents.map((c) => Math.max(0, c))
  const { top } = niceScale(Math.max(...values))
  // Each month's point, as percentages across and up the chart
  const points = values.map((cents, i) => ({
    x: months.length === 1 ? 50 : (i / (months.length - 1)) * 100,
    y: (cents / top) * 100,
  }))
  const average = Math.round(category.spentCents / months.length)
  const spansYears = months[0].slice(0, 4) !== months.at(-1)!.slice(0, 4)

  return (
    <li className="trend-card">
      <div className="trend-card-top">
        <span className="trend-card-name">
          <span className={`chart-swatch chart-swatch--${kindClass(category.kind)}`} aria-hidden="true" />
          <span className="trend-card-label">{category.name}</span>
        </span>
        <span className="muted small trend-card-average">{wholeDollars(Math.round(average / 100) * 100)}/mo</span>
      </div>

      <div className={months.length > 12 ? 'trend-chart dense' : 'trend-chart'} aria-hidden="true">
        <span className="trend-chart-top">{wholeDollars(top)}</span>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className="trend-chart-svg">
          <polyline
            className={`trend-line trend-line--${kindClass(category.kind)}`}
            points={points.map((p) => `${p.x},${HEIGHT - p.y}`).join(' ')}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {points.map((p, i) => (
          <span
            key={months[i]}
            className={`trend-dot trend-dot--${kindClass(category.kind)}${hovered === i ? ' active' : ''}`}
            style={{ left: `${p.x}%`, bottom: `${p.y}%` }}
          />
        ))}
        {/* Hover and click targets: one column per month, opening that month's transactions.
            Keyboard and screen reader users get the same links in the table below. */}
        <div className="trend-chart-hits">
          {months.map((month, i) => (
            <Link
              key={month}
              to={transactionsLink(category, month)}
              tabIndex={-1}
              onPointerEnter={() => setHovered(i)}
              onPointerLeave={() => setHovered(null)}
            />
          ))}
        </div>
        {hovered !== null && (
          <div className="chart-tooltip trend-tooltip" style={{ left: `${points[hovered].x}%` }}>
            <strong>{formatMonth(months[hovered])}</strong>
            <span>{formatCents(category.byMonthCents[hovered])}</span>
          </div>
        )}
      </div>

      <div className="trend-chart-labels" aria-hidden="true">
        <span>{formatShortMonth(months[0], spansYears)}</span>
        {months.length > 1 && <span>{formatShortMonth(months.at(-1)!, spansYears)}</span>}
      </div>

      {/* The same numbers for screen readers */}
      <table className="visually-hidden">
        <caption>{category.name} by month</caption>
        <tbody>
          {months.map((month, i) => (
            <tr key={month}>
              <th scope="row">{formatMonth(month)}</th>
              <td>
                <Link to={transactionsLink(category, month)}>{formatCents(category.byMonthCents[i])}</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </li>
  )
}

// A small line chart for each category, biggest spending first
export function CategoryTrends({ categories, months }: { categories: CategorySpending[]; months: MonthSpending[] }) {
  const monthList = months.map((m) => m.month)
  return (
    <figure className="chart">
      <div className="chart-legend" aria-hidden="true">
        <span className="chart-key">
          <span className="chart-swatch chart-swatch--bills" /> Bills
        </span>
        <span className="chart-key">
          <span className="chart-swatch chart-swatch--expenses" /> Expenses
        </span>
      </div>
      <ul className="trend-grid">
        {categories.map((category) => (
          <CategoryTrend key={category.id ?? 'uncategorized'} category={category} months={monthList} />
        ))}
      </ul>
    </figure>
  )
}
