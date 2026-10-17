import { useEffect, useState } from 'react'
import { apiGet } from '../api/client'
import { useAuth } from '../auth/useAuth'

type HealthResponse = { status: string }

type ApiStatus = 'checking' | 'online' | 'offline'

export function HomePage() {
  const { user, signOut, getToken } = useAuth()
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking')

  useEffect(() => {
    // /api/me confirms the backend accepts our sign-in (and creates our user record on first visit)
    getToken()
      .then((token) => Promise.all([apiGet<HealthResponse>('/health'), apiGet('/me', token)]))
      .then(([health]) => setApiStatus(health.status === 'ok' ? 'online' : 'offline'))
      .catch(() => setApiStatus('offline'))
  }, [getToken])

  return (
    <main className="app">
      <h1>Budget+</h1>
      <p>
        Signed in as {user?.displayName ?? user?.email}{' '}
        <button type="button" onClick={signOut}>
          Sign out
        </button>
      </p>
      <p className={`api-status api-status--${apiStatus}`}>API: {apiStatus}</p>
    </main>
  )
}
