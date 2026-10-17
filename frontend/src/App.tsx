import { Navigate, Route, Routes } from 'react-router'
import { useAuth } from './auth/useAuth'
import { Layout } from './components/Layout'
import { BillsPage } from './pages/BillsPage'
import { BudgetSetupPage } from './pages/BudgetSetupPage'
import { DashboardPage } from './pages/DashboardPage'
import { SignInPage } from './pages/SignInPage'
import { TransactionsPage } from './pages/TransactionsPage'

function App() {
  const { user } = useAuth()

  if (user === undefined) {
    return <main className="page">Loading…</main>
  }

  if (!user) {
    return <SignInPage />
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="bills" element={<BillsPage />} />
        <Route path="budget-setup" element={<BudgetSetupPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
