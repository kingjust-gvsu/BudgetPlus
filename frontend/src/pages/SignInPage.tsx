import { useState } from 'react'
import { useAuth } from '../auth/useAuth'

export function SignInPage() {
  const { signInWithGoogle } = useAuth()
  const [error, setError] = useState<string | null>(null)

  const handleSignIn = async () => {
    setError(null)
    try {
      await signInWithGoogle()
    } catch {
      setError('Sign-in failed. Please try again.')
    }
  }

  return (
    <main className="app">
      <h1>Budget+</h1>
      <p>Personal budgeting that respects the difference between bills and expenses.</p>
      <button type="button" onClick={handleSignIn}>
        Sign in with Google
      </button>
      {error && <p className="error">{error}</p>}
    </main>
  )
}
