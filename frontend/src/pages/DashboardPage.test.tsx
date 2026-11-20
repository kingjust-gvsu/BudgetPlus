import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MonthSummary, SpendingSummary } from '../api/types'
import { AuthContext, type AuthState } from '../auth/authContext'
import { monthOf, shiftMonth, today } from '../dates'
import { DashboardPage } from './DashboardPage'

const thisMonth = monthOf(today())

const october: MonthSummary = {
  month: thisMonth,
  incomeCents: 400000,
  remainderCents: 161600,
  overPlannedCents: 0,
  billDifferenceCents: 1400,
  uncategorizedCents: 650,
  totals: {
    billsPlannedCents: 153000,
    billsPaidCents: 133400,
    monthlyBillsPaid: 2,
    monthlyBills: 4,
    expensesLimitCents: 84000,
    expensesSpentCents: 62700,
  },
  categories: [
    { id: 'rent', name: 'Rent', kind: 'BILL', budgetType: 'FIXED', type: 'bill', estimateCents: 120000, paidCents: 120000, differenceCents: 0, state: 'paid' },
    { id: 'electric', name: 'Electric', kind: 'BILL', budgetType: 'FIXED', type: 'bill', estimateCents: 12000, paidCents: 13400, differenceCents: 1400, state: 'paid' },
    { id: 'internet', name: 'Internet', kind: 'BILL', budgetType: 'FIXED', type: 'bill', estimateCents: 6500, paidCents: 0, differenceCents: 0, state: 'pending' },
    {
      id: 'car-insurance',
      name: 'Car insurance',
      kind: 'BILL',
      budgetType: 'FIXED',
      type: 'fundBill',
      setAsideCents: 10000,
      targetCents: 60000,
      frequencyMonths: 6,
      fund: { setAsideCents: 10000, balanceCents: 30000, nextDueDate: '2027-03-15', monthsLeft: 4, paidCents: 0, remainderChangeCents: 0 },
    },
    { id: 'groceries', name: 'Groceries', kind: 'EXPENSE', budgetType: 'PERCENT_OF_INCOME', type: 'expense', limitCents: 48000, spentCents: 31000, leftCents: 17000, state: 'under' },
    { id: 'gas', name: 'Gas', kind: 'EXPENSE', budgetType: 'FIXED', type: 'expense', limitCents: 16000, spentCents: 17200, leftCents: -1200, state: 'over' },
    { id: 'gifts', name: 'Gifts', kind: 'EXPENSE', budgetType: 'FIXED', type: 'expense', limitCents: null, spentCents: 2500, leftCents: null, state: 'noLimit' },
    { id: 'savings', name: 'Savings', kind: 'EXPENSE', budgetType: 'REMAINDER', type: 'expense', limitCents: 161600, spentCents: 0, leftCents: 161600, state: 'under' },
  ],
}

let fetchMock: ReturnType<typeof vi.fn>

const spending: SpendingSummary = {
  months: [{ month: '2026-10', billsCents: 120000, expensesCents: 30000, incomeCents: 400000 }],
  categories: [
    { id: 'rent', name: 'Rent', kind: 'BILL', spentCents: 120000, byMonthCents: [120000] },
    { id: 'groceries', name: 'Groceries', kind: 'EXPENSE', spentCents: 30000, byMonthCents: [30000] },
  ],
}

function renderDashboard(summary: MonthSummary = october) {
  fetchMock = vi.fn((url: string) => Promise.resolve(Response.json(url.startsWith('/api/spending') ? spending : summary)))
  vi.stubGlobal('fetch', fetchMock)
  const auth: AuthState = {
    user: { email: 'test@example.com', displayName: 'Test User' },
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    getToken: vi.fn().mockResolvedValue('test-token'),
  }
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={auth}>
        <DashboardPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

const row = (name: string) => screen.getByText(name).closest('li')!

describe('DashboardPage', () => {
  beforeEach(() => {
    fetchMock = vi.fn()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("shows how the month's spending splits across categories", async () => {
    renderDashboard()

    expect(await screen.findByRole('heading', { name: 'Where it went' })).toBeInTheDocument()
    const rent = screen.getByText('Rent', { selector: '.donut-legend-name' }).closest('li')!
    expect(rent).toHaveTextContent('Rent$1,200.0080%')
    expect(screen.getByRole('link', { name: 'See trends' })).toHaveAttribute('href', '/trends')
    expect(fetchMock).toHaveBeenCalledWith(`/api/spending?to=${thisMonth}&months=1`, expect.anything())
  })

  it("loads this month's summary", async () => {
    renderDashboard()
    await screen.findByText('Groceries')

    expect(fetchMock).toHaveBeenCalledWith(`/api/summary?month=${thisMonth}`, expect.anything())
  })

  it('shows the month totals', async () => {
    renderDashboard()
    const tiles = await screen.findByRole('region', { name: 'Month summary' })

    expect(within(tiles).getByText('$4,000.00')).toBeInTheDocument()
    expect(within(tiles).getByText('of $1,530.00 planned · 2 of 4 paid')).toBeInTheDocument()
    expect(within(tiles).getByText('of $840.00 in limits')).toBeInTheDocument()
    expect(within(tiles).getByText('Savings (remainder)')).toBeInTheDocument()
    expect(within(tiles).getByText('-$14.00 from bills')).toBeInTheDocument()
  })

  it('shows expenses as left or over their limit', async () => {
    renderDashboard()
    // Groceries is also in the spending donut, so look only in the Expenses card
    const expenses = within(await screen.findByRole('region', { name: 'Expenses' }))
    const expenseRow = (name: string) => expenses.getByText(name).closest('li')!

    expect(within(expenseRow('Groceries')).getByText('$170.00 left')).toBeInTheDocument()
    expect(within(expenseRow('Gas')).getByText('$12.00 over')).toBeInTheDocument()
    expect(within(expenseRow('Gifts')).getByText('No limit set')).toBeInTheDocument()
  })

  it('shows bills neutrally as paid or pending', async () => {
    renderDashboard()
    await screen.findByText('Electric')

    expect(within(row('Electric')).getByText('· Paid')).toBeInTheDocument()
    expect(within(row('Electric')).getByText(/est\. \$120\.00/)).toBeInTheDocument()
    expect(within(row('Internet')).getByText('· Pending')).toBeInTheDocument()
  })

  it('shows progress toward bills that are not monthly', async () => {
    renderDashboard()
    await screen.findByText('Car insurance')

    expect(within(row('Car insurance')).getByText('$300.00 of $600.00 saved')).toBeInTheDocument()
    expect(within(row('Car insurance')).getByText(/Due March 15, 2027/)).toBeInTheDocument()
  })

  it('points out spending without a category', async () => {
    renderDashboard()

    expect(await screen.findByText(/\$6\.50 of spending isn't in a category yet/)).toBeInTheDocument()
  })

  it('warns when budgets add up to more than income', async () => {
    renderDashboard({ ...october, overPlannedCents: 13000 })

    expect(await screen.findByRole('status')).toHaveTextContent('Your budgets add up to $130.00 more than your income.')
  })

  it('asks for income when it has not been entered', async () => {
    renderDashboard({ ...october, incomeCents: null, remainderCents: null })

    expect(await screen.findByText(/Add your monthly income on/)).toBeInTheDocument()
  })

  it('invites setting up a budget when there are no categories', async () => {
    renderDashboard({ ...october, categories: [] })

    expect(await screen.findByRole('link', { name: 'Go to Budget setup' })).toHaveAttribute('href', '/budget-setup')
  })

  it('loads the previous month', async () => {
    renderDashboard()
    await screen.findByText('Groceries')

    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(`/api/summary?month=${shiftMonth(thisMonth, -1)}`, expect.anything()),
    )
  })
})
