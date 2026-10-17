import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { AuthContext, type AuthState } from './auth/authContext'

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
const okResponse = () => Promise.resolve(Response.json({ status: 'ok' }))

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
    expect(screen.getByText('Test User')).toBeInTheDocument()
  })

  it('shows the page for the current URL and marks its tab', () => {
    renderApp({ user: signedInUser }, '/budget-setup')

    expect(screen.getByRole('heading', { name: 'Budget setup' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Budget setup' })).toHaveAttribute('aria-current', 'page')
  })

  it('sends unknown URLs to the dashboard', () => {
    renderApp({ user: signedInUser }, '/not-a-page')

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('sends the sign-in token to the API', async () => {
    renderApp({ user: signedInUser })
    await screen.findByText('API: online')

    expect(fetch).toHaveBeenCalledWith('/api/me', { headers: { Authorization: 'Bearer test-token' } })
  })

  it('shows the API as offline when requests fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    renderApp({ user: signedInUser })

    expect(await screen.findByText('API: offline')).toBeInTheDocument()
  })
})
