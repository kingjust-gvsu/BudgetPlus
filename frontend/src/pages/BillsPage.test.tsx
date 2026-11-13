import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MonthSummary } from '../api/types'
import { AuthContext, type AuthState } from '../auth/authContext'
import { monthOf, shiftMonth, today } from '../dates'
import { BillsPage } from './BillsPage'

const thisMonth = monthOf(today())

const summary: MonthSummary = {
  month: thisMonth,
  incomeCents: 400000,
  remainderCents: 161600,
  overPlannedCents: 0,
  billDifferenceCents: -1100,
  uncategorizedCents: 0,
  totals: { billsPlannedCents: 0, billsPaidCents: 0, monthlyBillsPaid: 0, monthlyBills: 0, expensesLimitCents: 0, expensesSpentCents: 0 },
  categories: [
    { id: 'rent', name: 'Rent', kind: 'BILL', budgetType: 'FIXED', type: 'bill', estimateCents: 120000, paidCents: 120000, differenceCents: 0, state: 'paid' },
    { id: 'electric', name: 'Electric', kind: 'BILL', budgetType: 'FIXED', type: 'bill', estimateCents: 12000, paidCents: 13400, differenceCents: 1400, state: 'paid' },
    { id: 'water', name: 'Water', kind: 'BILL', budgetType: 'FIXED', type: 'bill', estimateCents: 5000, paidCents: 2500, differenceCents: -2500, state: 'paid' },
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
    {
      id: 'registration',
      name: 'Registration',
      kind: 'BILL',
      budgetType: 'FIXED',
      type: 'fundBill',
      setAsideCents: null,
      targetCents: null,
      frequencyMonths: 12,
    },
    { id: 'savings', name: 'Savings', kind: 'EXPENSE', budgetType: 'REMAINDER', type: 'expense', limitCents: 161600, spentCents: 0, leftCents: 161600, state: 'under' },
  ],
}

let fetchMock: ReturnType<typeof vi.fn>

function renderBills(data: MonthSummary = summary) {
  fetchMock = vi.fn(() => Promise.resolve(Response.json(data)))
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
        <BillsPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

const tableRow = (name: string) => screen.getByRole('row', { name: new RegExp(`^${name}`) })

describe('BillsPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists monthly bills with estimate, actual, and status', async () => {
    renderBills()
    await screen.findByText('Electric')

    const electric = tableRow('Electric')
    expect(within(electric).getByText('Paid')).toBeInTheDocument()
    expect(within(electric).getByText('$120.00')).toBeInTheDocument()
    expect(within(electric).getByText('$134.00')).toBeInTheDocument()
    expect(within(tableRow('Internet')).getByText('Pending')).toBeInTheDocument()
  })

  it('shows how much each paid bill differed from its estimate', async () => {
    renderBills()
    await screen.findByText('Electric')

    expect(within(tableRow('Electric')).getByText('+$14.00')).toBeInTheDocument()
    expect(within(tableRow('Water')).getByText('−$25.00')).toBeInTheDocument()
    expect(within(tableRow('Rent')).getByText('—')).toBeInTheDocument()
  })

  it('totals estimates and payments', async () => {
    renderBills()
    const total = await screen.findByRole('row', { name: /^Total/ })

    // Estimates 1200 + 120 + 50 + 65; paid 1200 + 134 + 25
    expect(within(total).getByText('$1,435.00')).toBeInTheDocument()
    expect(within(total).getByText('$1,359.00')).toBeInTheDocument()
  })

  it('shows each fund with how often it is due and how much is saved', async () => {
    renderBills()
    await screen.findByText('Car insurance')

    const card = screen.getByText('Car insurance').closest('.fund-card') as HTMLElement
    expect(within(card).getByText('every 6 months')).toBeInTheDocument()
    expect(within(card).getByText(/of \$600\.00 saved/)).toBeInTheDocument()
    expect(within(card).getByText(/Due March 15, 2027 · \$100\.00 set aside this month/)).toBeInTheDocument()
  })

  it('asks for the details of a fund bill that has none yet', async () => {
    renderBills()
    await screen.findByText('Registration')

    const card = screen.getByText('Registration').closest('.fund-card') as HTMLElement
    expect(within(card).getByText('yearly')).toBeInTheDocument()
    expect(within(card).getByText(/to start saving/)).toBeInTheDocument()
  })

  it('links to Budget setup to add a non-monthly bill', async () => {
    renderBills()

    expect(await screen.findByRole('link', { name: '+ Add a non-monthly bill' })).toHaveAttribute('href', '/budget-setup')
  })

  it('suggests adding bills when there are none', async () => {
    renderBills({ ...summary, categories: [] })

    expect(await screen.findByText(/No monthly bills yet/)).toBeInTheDocument()
  })

  it('loads the previous month', async () => {
    renderBills()
    await screen.findByText('Electric')

    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(`/api/summary?month=${shiftMonth(thisMonth, -1)}`, expect.anything()),
    )
  })
})
