import { useEffect, useState } from 'react'
import { apiGet } from '../api/client'

type HealthResponse = { status: string }

type ApiStatus = 'checking' | 'online' | 'offline'

export function DashboardPage() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking')

  useEffect(() => {
    apiGet<HealthResponse>('/health')
      .then((health) => setApiStatus(health.status === 'ok' ? 'online' : 'offline'))
      .catch(() => setApiStatus('offline'))
  }, [])

  return (
    <>
      <h1>Dashboard</h1>
      <p className="page-intro">A summary of this month: income, bills, expenses, and what's left over.</p>
      <p className={`api-status api-status--${apiStatus}`}>API: {apiStatus}</p>
    </>
  )
}
