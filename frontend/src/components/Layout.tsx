import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router'
import { apiGet } from '../api/client'
import { useAuth } from '../auth/useAuth'
import { UserMenu } from './UserMenu'

const tabs = [
  { to: '/', label: 'Dashboard' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/accounts', label: 'Accounts' },
  { to: '/bills', label: 'Bills & funds' },
  { to: '/trends', label: 'Trends' },
  { to: '/budget-setup', label: 'Budget setup' },
]

// Header with the page tabs, shared by every signed-in page.
export function Layout() {
  const { getToken } = useAuth()

  useEffect(() => {
    // Lets the backend create the user's record on their first visit
    getToken()
      .then((token) => apiGet('/me', token))
      .catch(() => {})
  }, [getToken])

  return (
    <>
      <header className="site-header">
        <nav aria-label="Main" className="site-nav">
          <strong className="site-name">Budget+</strong>
          {tabs.map((tab) => (
            <NavLink key={tab.to} to={tab.to} end className="nav-tab">
              {tab.label}
            </NavLink>
          ))}
          <UserMenu />
        </nav>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </>
  )
}
