import { useEffect, useState } from 'react'
import { apiGet } from './api/client'

type HealthResponse = { status: string }

type ApiStatus = 'checking' | 'online' | 'offline'

function App() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking')

  useEffect(() => {
    apiGet<HealthResponse>('/health')
      .then((health) => setApiStatus(health.status === 'ok' ? 'online' : 'offline'))
      .catch(() => setApiStatus('offline'))
  }, [])

  return (
    <main className="app">
      <h1>Budget+</h1>
      <p>Personal budgeting that respects the difference between bills and expenses.</p>
      <p className={`api-status api-status--${apiStatus}`}>
        API: {apiStatus}
      </p>
    </main>
  )
}

export default App
