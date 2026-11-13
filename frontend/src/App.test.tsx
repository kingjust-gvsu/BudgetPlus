import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { AuthContext, type AuthState } from './auth/authContext'
import { formatMonth, monthOf, today } from './dates'

function renderApp(auth: Partial<AuthState>, path = '/') {
  const value: AuthState = {
    user: null,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    getToken: vi.fn().mockResolvedValue('test-token'),
    ...auth,
  }
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthContext.Provider value={value}>
        <App />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

const signedInUser = { email: 'test@example.com', displayName: 'Test User' }
const thisMonth = formatMonth(monthOf(today()))

const emptySummary = {
  month: '2026-11',
  incomeCents: null,
  remainderCents: null,
  overPlannedCents: 0,
  billDifferenceCents: 0,
  uncategorizedCents: 0,
  totals: { billsPlannedCents: 0, billsPaidCents: 0, monthlyBillsPaid: 0, monthlyBills: 0, expensesLimitCents: 0, expensesSpentCents: 0 },
  categories: [],
}
const okResponse = (url: string) =>
  Promise.resolve(Response.json(url.startsWith('/api/summary') ? emptySummary : { status: 'ok' }))

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(okResponse))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the sign-in button when signed out', () => {
    renderApp({ user: null })

    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument()
  })

  it('shows the page tabs and the signed-in user', () => {
    renderApp({ user: signedInUser })

    for (const tab of ['Dashboard', 'Transactions', 'Bills & funds', 'Budget setup']) {
      expect(screen.getByRole('link', { name: tab })).toBeInTheDocument()
    }
  })

  it('keeps the account options in a menu in the corner', () => {
    renderApp({ user: signedInUser })
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Account menu' }))

    expect(screen.getByText('Test User')).toBeInTheDocument()
    expect(screen.getByText('test@example.com')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('closes the account menu with Escape', () => {
    renderApp({ user: signedInUser })
    fireEvent.click(screen.getByRole('button', { name: 'Account menu' }))

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Account menu' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('signs out from the account menu', () => {
    const signOut = vi.fn()
    renderApp({ user: signedInUser, signOut })
    fireEvent.click(screen.getByRole('button', { name: 'Account menu' }))

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(signOut).toHaveBeenCalled()
  })

  it('shows the page for the current URL and marks its tab', () => {
    renderApp({ user: signedInUser }, '/budget-setup')

    expect(screen.getByRole('heading', { name: 'Budget setup' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Budget setup' })).toHaveAttribute('aria-current', 'page')
  })

  it('sends unknown URLs to the dashboard', () => {
    renderApp({ user: signedInUser }, '/not-a-page')

    expect(screen.getByRole('heading', { name: thisMonth })).toBeInTheDocument()
  })

  it('sends the sign-in token to the API', async () => {
    renderApp({ user: signedInUser })
    await screen.findByRole('heading', { name: 'Set up your budget' })

    expect(fetch).toHaveBeenCalledWith('/api/me', { headers: { Authorization: 'Bearer test-token' } })
  })

  it("shows an error when the dashboard can't load", async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    renderApp({ user: signedInUser })

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load this month")
  })
})
