import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { AuthContext, type AuthState } from './auth/authContext'

function renderApp(auth: Partial<AuthState>) {
  const value: AuthState = {
    user: null,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    getToken: vi.fn().mockResolvedValue('test-token'),
    ...auth,
  }
  return render(
    <AuthContext.Provider value={value}>
      <App />
    </AuthContext.Provider>,
  )
}

const signedInUser = { email: 'test@example.com', displayName: 'Test User' }

describe('App', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the sign-in button when signed out', () => {
    renderApp({ user: null })

    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument()
  })

  it('shows the user and API status when signed in', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(Response.json({ status: 'ok' }))))

    renderApp({ user: signedInUser })

    expect(screen.getByText(/Signed in as Test User/)).toBeInTheDocument()
    expect(await screen.findByText('API: online')).toBeInTheDocument()
  })

  it('sends the sign-in token to the API', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ status: 'ok' })))
    vi.stubGlobal('fetch', fetchMock)

    renderApp({ user: signedInUser })
    await screen.findByText('API: online')

    expect(fetchMock).toHaveBeenCalledWith('/api/me', { headers: { Authorization: 'Bearer test-token' } })
  })

  it('shows the API as offline when requests fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    renderApp({ user: signedInUser })

    expect(await screen.findByText('API: offline')).toBeInTheDocument()
  })
})
