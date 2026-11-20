import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SpendingSummary } from '../api/types'
import { AuthContext, type AuthState } from '../auth/authContext'
import { monthOf, today } from '../dates'
import { TrendsPage } from './TrendsPage'

const thisMonth = monthOf(today())

const spending: SpendingSummary = {
  months: [
    { month: '2026-09', billsCents: 150000, expensesCents: 60000, incomeCents: 400000 },
    { month: '2026-10', billsCents: 140000, expensesCents: 50000, incomeCents: 400000 },
    { month: '2026-11', billsCents: 0, expensesCents: 0, incomeCents: 400000 },
  ],
  categories: [
    { id: 'rent', name: 'Rent', kind: 'BILL', spentCents: 240000, byMonthCents: [120000, 120000, 0] },
    { id: 'groceries', name: 'Groceries', kind: 'EXPENSE', spentCents: 95000, byMonthCents: [50000, 45000, 0] },
    { id: null, name: 'Uncategorized', kind: null, spentCents: 15000, byMonthCents: [5000, 10000, 0] },
  ],
}

function renderTrends(data: SpendingSummary = spending) {
  const fetchMock = vi.fn(() => Promise.resolve(Response.json(data)))
  vi.stubGlobal('fetch', fetchMock)
  const auth: AuthState = {
    user: { email: 'test@example.com', displayName: 'Test User' },
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    getToken: vi.fn().mockResolvedValue('test-token'),
  }
  render(
    <MemoryRouter>
      <AuthContext.Provider value={auth}>
        <TrendsPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
  return fetchMock
}

describe('TrendsPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads the last six months and sums them up', async () => {
    const fetchMock = renderTrends()

    expect(await screen.findByText('$4,000.00 spent in the last 3 months, about $1,333.33 a month.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(`/api/spending?to=${thisMonth}&months=6`, expect.anything())
  })

  it('compares each month with income', async () => {
    renderTrends()

    expect(await screen.findByText(/Income \$4,000/)).toBeInTheDocument()
    expect(screen.getByText('▼ $1,900')).toBeInTheDocument() // September: $2,100 spent
  })

  it('lists each month in a table for screen readers', async () => {
    renderTrends()

    const table = await screen.findByRole('table', { name: 'Spending by month' })
    const september = within(table).getByRole('row', { name: /September 2026/ })
    expect(september).toHaveTextContent('$1,500.00$600.00$2,100.00$4,000.00$1,900 left')
  })

  it('shows a small chart for each category, largest first', async () => {
    renderTrends()

    const cards = await screen.findAllByRole('listitem')
    expect(cards.map((c) => c.querySelector('.trend-card-name')?.textContent?.trim())).toEqual(['Rent', 'Groceries', 'Uncategorized'])
    expect(within(cards[0]).getByText('$800/mo')).toBeInTheDocument() // $2,400 over the 3 months
    const groceries = within(cards[1]).getByRole('table', { name: 'Groceries by month' })
    expect(within(groceries).getByRole('row', { name: /October 2026/ })).toHaveTextContent('$450.00')
  })

  it('switches the time range', async () => {
    const fetchMock = renderTrends()
    await screen.findByRole('heading', { name: 'Spending by month' })

    fireEvent.click(screen.getByRole('button', { name: '12 months' }))

    expect(screen.getByRole('button', { name: '12 months' })).toHaveAttribute('aria-pressed', 'true')
    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(`/api/spending?to=${thisMonth}&months=12`, expect.anything()),
    )
  })

  it('can show everything since the first transaction', async () => {
    const fetchMock = renderTrends()
    await screen.findByRole('heading', { name: 'Spending by month' })

    fireEvent.click(screen.getByRole('button', { name: 'All' }))

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(`/api/spending?to=${thisMonth}&months=all`, expect.anything()),
    )
    expect(await screen.findByText(/spent since September 2026/)).toBeInTheDocument()
  })

  it('says so when there is no spending yet', async () => {
    renderTrends({ months: [{ month: thisMonth, billsCents: 0, expensesCents: 0, incomeCents: null }], categories: [] })

    expect(await screen.findByText('No spending to show yet.')).toBeInTheDocument()
  })
})
