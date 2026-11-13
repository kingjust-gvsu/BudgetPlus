import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import { SignInPage } from './SignInPage'

function renderPage(signInWithGoogle: AuthState['signInWithGoogle']) {
  const auth: AuthState = {
    user: null,
    signInWithGoogle,
    signOut: vi.fn(),
    getToken: vi.fn(),
  }
  return render(
    <AuthContext.Provider value={auth}>
      <SignInPage />
    </AuthContext.Provider>,
  )
}

describe('SignInPage', () => {
  it('shows that sign-in is in progress while the Google popup is open', () => {
    renderPage(() => new Promise(() => {}))

    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }))

    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled()
  })

  it('lets the user try again if sign-in fails', async () => {
    renderPage(vi.fn().mockRejectedValue(new Error('popup closed')))

    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Please try again')
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled()
  })
})
