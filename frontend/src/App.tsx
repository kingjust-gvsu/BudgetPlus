import { useAuth } from './auth/useAuth'
import { HomePage } from './pages/HomePage'
import { SignInPage } from './pages/SignInPage'

function App() {
  const { user } = useAuth()

  if (user === undefined) {
    return <main className="app">Loading…</main>
  }

  return user ? <HomePage /> : <SignInPage />
}

export default App
