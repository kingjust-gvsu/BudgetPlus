import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import { IncomeSection } from './IncomeSection'

let incomeCents: number | null
let fetchMock: ReturnType<typeof vi.fn>

function fakeApi(_url: string, init?: RequestInit) {
  if (init?.method === 'PATCH') incomeCents = JSON.parse(String(init.body)).monthlyIncomeCents
  return Response.json({ id: 'u1', email: 'test@example.com', monthlyIncomeCents: incomeCents })
}

function renderSection() {
  const auth: AuthState = {
    user: { email: 'test@example.com', displayName: 'Test User' },
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    getToken: vi.fn().mockResolvedValue('test-token'),
  }
  return render(
    <AuthContext.Provider value={auth}>
      <IncomeSection />
    </AuthContext.Provider>,
  )
}

const incomeInput = () => screen.getByLabelText('Estimated monthly income ($)') as HTMLInputElement

describe('IncomeSection', () => {
  beforeEach(() => {
    incomeCents = 400000
    fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(fakeApi(url, init)))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the saved income', async () => {
    renderSection()

    await vi.waitFor(() => expect(incomeInput().value).toBe('4000.00'))
  })

  it('saves a new income in cents', async () => {
    renderSection()
    await vi.waitFor(() => expect(incomeInput().value).toBe('4000.00'))

    fireEvent.change(incomeInput(), { target: { value: '4,500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Saved: $4,500.00 a month.')
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')!
    expect(JSON.parse(patch[1].body)).toEqual({ monthlyIncomeCents: 450000 })
  })

  it('shows and clears the problem while typing', async () => {
    renderSection()
    await vi.waitFor(() => expect(incomeInput().value).toBe('4000.00'))

    fireEvent.change(incomeInput(), { target: { value: '4000x' } })
    expect(screen.getByRole('alert')).toHaveTextContent('Enter an amount like 4000')

    fireEvent.change(incomeInput(), { target: { value: '4000' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it("explains an amount it can't read", async () => {
    renderSection()
    await vi.waitFor(() => expect(incomeInput().value).toBe('4000.00'))

    fireEvent.change(incomeInput(), { target: { value: 'a lot' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter an amount like 4000')
  })
})
