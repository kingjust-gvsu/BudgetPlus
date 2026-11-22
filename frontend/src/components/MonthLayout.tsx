import { NavLink, Outlet } from 'react-router'
import { monthOf, today } from '../dates'
import { useMonth } from '../useMonth'
import { MonthPicker } from './MonthPicker'
import './MonthLayout.css'

const tabs = [
  { to: '/', label: 'Dashboard' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/bills', label: 'Bills' },
]

// The home view: a month picker over the pages that show one month. The month carries across them.
export function MonthLayout() {
  const [month, setMonth] = useMonth()
  const search = month === monthOf(today()) ? '' : `?month=${month}`
  return (
    <>
      <div className="month-band">
        <MonthPicker month={month} onChange={setMonth} />
        <nav aria-label="Month views" className="month-tabs">
          {tabs.map((tab) => (
            <NavLink key={tab.to} to={{ pathname: tab.to, search }} end className="month-tab">
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <Outlet />
    </>
  )
}
