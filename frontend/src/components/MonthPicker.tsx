import { useEffect, useRef, useState } from 'react'
import { formatMonth, formatShortMonth, monthOf, shiftMonth, today } from '../dates'
import './MonthPicker.css'

type Props = {
  month: string // YYYY-MM
  onChange: (month: string) => void
}

const MONTH_NUMBERS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']

// ‹ November 2026 › with a calendar of months under the name, to jump straight to one
export function MonthPicker({ month, onChange }: Props) {
  const thisMonth = monthOf(today())
  const [open, setOpen] = useState(false)
  // The year the calendar is showing, which can differ from the chosen month's
  const [year, setYear] = useState(Number(month.slice(0, 4)))
  const ref = useRef<HTMLDivElement>(null)

  // Close when clicking anywhere else or pressing Escape
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const toggle = () => {
    setYear(Number(month.slice(0, 4)))
    setOpen((o) => !o)
  }

  const pick = (next: string) => {
    setOpen(false)
    onChange(next)
  }

  return (
    <div className="month-picker" ref={ref}>
      <button type="button" className="button month-picker-arrow" aria-label="Previous month" onClick={() => onChange(shiftMonth(month, -1))}>
        ‹
      </button>
      <h1 className="month-picker-title">
        <button type="button" className="month-picker-name" aria-haspopup="dialog" aria-expanded={open} onClick={toggle}>
          {formatMonth(month)}
          <svg width="14" height="14" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </h1>
      <button type="button" className="button month-picker-arrow" aria-label="Next month" onClick={() => onChange(shiftMonth(month, 1))}>
        ›
      </button>
      {month !== thisMonth && (
        <button type="button" className="button" onClick={() => onChange(thisMonth)}>
          This month
        </button>
      )}

      {open && (
        <div className="month-calendar" role="dialog" aria-label="Pick a month">
          <div className="month-calendar-year">
            <button type="button" className="link-button" aria-label="Previous year" onClick={() => setYear(year - 1)}>
              ‹
            </button>
            <strong>{year}</strong>
            <button type="button" className="link-button" aria-label="Next year" onClick={() => setYear(year + 1)}>
              ›
            </button>
          </div>
          <div className="month-calendar-grid">
            {MONTH_NUMBERS.map((number) => {
              const value = `${year}-${number}`
              const classes = ['month-calendar-month', value === month && 'chosen', value === thisMonth && 'current']
              return (
                <button
                  key={value}
                  type="button"
                  className={classes.filter(Boolean).join(' ')}
                  aria-label={formatMonth(value)}
                  aria-pressed={value === month}
                  onClick={() => pick(value)}
                >
                  {formatShortMonth(value)}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
