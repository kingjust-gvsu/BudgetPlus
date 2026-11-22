import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { describe, expect, it } from 'vitest'
import { formatMonth, monthOf, shiftMonth, today } from '../dates'
import { useMonth } from '../useMonth'
import { MonthLayout } from './MonthLayout'

const thisMonth = monthOf(today())
const lastMonth = shiftMonth(thisMonth, -1)

// Stands in for a month page: shows the month it gets and the address
function FakePage({ name }: { name: string }) {
  const [month] = useMonth()
  const location = useLocation()
  return (
    <p>
      {name} for {month} at {location.pathname + location.search}
    </p>
  )
}

function renderMonthView(address = '/') {
  return render(
    <MemoryRouter initialEntries={[address]}>
      <Routes>
        <Route element={<MonthLayout />}>
          <Route index element={<FakePage name="Dashboard" />} />
          <Route path="transactions" element={<FakePage name="Transactions" />} />
          <Route path="bills" element={<FakePage name="Bills" />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('MonthLayout', () => {
  it('shows this month and its tabs', () => {
    renderMonthView()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(formatMonth(thisMonth))
    expect(screen.getByText(`Dashboard for ${thisMonth} at /`)).toBeInTheDocument()
    const tabs = within(screen.getByRole('navigation', { name: 'Month views' })).getAllByRole('link')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Dashboard', 'Transactions', 'Bills & funds'])
    expect(screen.queryByRole('button', { name: 'This month' })).not.toBeInTheDocument()
  })

  it('moves a month with the arrows and keeps it across tabs', () => {
    renderMonthView()

    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(screen.getByText(`Dashboard for ${lastMonth} at /?month=${lastMonth}`)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: 'Transactions' }))
    expect(screen.getByText(`Transactions for ${lastMonth} at /transactions?month=${lastMonth}`)).toBeInTheDocument()
  })

  it('goes back to this month', () => {
    renderMonthView(`/bills?month=${lastMonth}`)

    fireEvent.click(screen.getByRole('button', { name: 'This month' }))

    expect(screen.getByText(`Bills for ${thisMonth} at /bills`)).toBeInTheDocument()
  })

  it('jumps to a month picked from the calendar', () => {
    renderMonthView()

    fireEvent.click(screen.getByRole('button', { name: new RegExp(formatMonth(thisMonth)) }))
    const calendar = screen.getByRole('dialog', { name: 'Pick a month' })
    fireEvent.click(within(calendar).getByRole('button', { name: 'Previous year' }))
    fireEvent.click(within(calendar).getByRole('button', { name: 'Previous year' }))
    const year = Number(thisMonth.slice(0, 4)) - 2
    fireEvent.click(within(calendar).getByRole('button', { name: formatMonth(`${year}-03`) }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText(`Dashboard for ${year}-03 at /?month=${year}-03`)).toBeInTheDocument()
  })

  it('ignores a month in the address that is not a real month', () => {
    renderMonthView('/?month=2026-13')

    expect(screen.getByText(new RegExp(`Dashboard for ${thisMonth}`))).toBeInTheDocument()
  })
})
