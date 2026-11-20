import { useState } from 'react'
import type { CategorySpending } from '../api/types'
import { donutSlices } from '../charts'
import { formatCents } from '../money'
import './charts.css'

const SIZE = 180
const STROKE = 28
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const GAP = 2 // px of background between slices

// A ring showing how the month's spending splits across categories, with a legend beside it
export function CategoryDonut({ categories }: { categories: CategorySpending[] }) {
  const [hovered, setHovered] = useState<string | null>(null)
  const slices = donutSlices(categories)
  const total = slices.reduce((sum, s) => sum + s.cents, 0)
  const share = (cents: number) => `${Math.round((cents / total) * 100)}%`
  const active = slices.find((s) => s.key === hovered)

  // Where each slice starts around the ring
  const starts = slices.map((_, i) => slices.slice(0, i).reduce((sum, s) => sum + (s.cents / total) * CIRCUMFERENCE, 0))
  return (
    <figure className="chart donut">
      <div className="donut-ring">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {slices.map((s, i) => {
              const length = (s.cents / total) * CIRCUMFERENCE
              const visible = slices.length > 1 ? Math.max(length - GAP, 1) : length
              return (
                <circle
                  key={s.key}
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={RADIUS}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={hovered === s.key ? STROKE + 6 : STROKE}
                  strokeDasharray={`${visible} ${CIRCUMFERENCE - visible}`}
                  strokeDashoffset={-starts[i]}
                  opacity={hovered && hovered !== s.key ? 0.45 : 1}
                  onPointerEnter={() => setHovered(s.key)}
                  onPointerLeave={() => setHovered(null)}
                />
              )
            })}
          </g>
        </svg>
        <div className="donut-center">
          <span className="donut-center-label">{active ? active.name : 'Spent'}</span>
          <strong>{formatCents(active ? active.cents : total)}</strong>
          {active && <span className="donut-center-label">{share(active.cents)}</span>}
        </div>
      </div>

      <ul className="donut-legend">
        {slices.map((s) => (
          <li
            key={s.key}
            className={hovered === s.key ? 'donut-legend-row active' : 'donut-legend-row'}
            onPointerEnter={() => setHovered(s.key)}
            onPointerLeave={() => setHovered(null)}
          >
            <span className="chart-swatch" style={{ background: s.color }} aria-hidden="true" />
            <span className="donut-legend-name">{s.name}</span>
            <span className="donut-legend-amount">{formatCents(s.cents)}</span>
            <span className="donut-legend-share muted">{share(s.cents)}</span>
          </li>
        ))}
      </ul>
    </figure>
  )
}
