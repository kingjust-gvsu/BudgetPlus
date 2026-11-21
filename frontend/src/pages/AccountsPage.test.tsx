import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account } from '../api/types'
import { AuthContext, type AuthState } from '../auth/authContext'
import { AccountsPage } from './AccountsPage'

let accounts: Account[]
let fetchMock: ReturnType<typeof vi.fn>

const checking: Account = { id: 'acct-1', name: 'Checking', type: 'BANK', startingBalanceCents: 500000, startDate: '2026-10-01', balanceCents: 724367 }
const card: Account = { id: 'acct-2', name: 'Amazon Card', type: 'CREDIT_CARD', startingBalanceCents: -20000, startDate: '2026-10-01', balanceCents: -24000 }
const fund: Account = { id: 'acct-3', name: 'Mortgage fund', type: 'FUND', startingBalanceCents: 0, startDate: '2026-10-01', balanceCents: -211230 }

// A small stand-in for the API: lists accounts, and answers changes the way the real one does
function fakeApi(url: string, init?: RequestInit): Response {
  const method = init?.method ?? 'GET'
  if (method === 'GET') return Response.json(accounts)
  if (method === 'DELETE' && url.endsWith(card.id)) {
    return Response.json({ error: 'This account has transactions. Move or delete them first.' }, { status: 409 })
  }
  if (method === 'DELETE') return new Response(null, { status: 204 })
  return Response.json({}, { status: method === 'POST' ? 201 : 200 })
}

function renderPage() {
  const auth: AuthState = {
    user: { email: 'test@example.com', displayName: 'Test User' },
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    getToken: vi.fn().mockResolvedValue('test-token'),
  }
  return render(
    <AuthContext.Provider value={auth}>
      <AccountsPage />
    </AuthContext.Provider>,
  )
}

const row = (name: string) => screen.getByText(name, { selector: '.account-name' }).closest('tr')!
const sent = (method: string) => {
  const call = fetchMock.mock.calls.find(([, init]) => init?.method === method)!
  return { url: call[0], body: call[1].body ? JSON.parse(String(call[1].body)) : undefined }
}

describe('AccountsPage', () => {
  beforeEach(() => {
    accounts = [checking, card, fund]
    fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(fakeApi(url, init)))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('shows each account with its balance, a card as what you owe, and the total', async () => {
    renderPage()

    expect(await screen.findByText('Checking')).toBeInTheDocument()
    expect(row('Checking')).toHaveTextContent('Bank account')
    expect(row('Checking')).toHaveTextContent('$7,243.67')
    expect(row('Amazon Card')).toHaveTextContent('$240.00 owed')
    expect(row('Mortgage fund')).toHaveTextContent('-$2,112.30')
    expect(row('Mortgage fund')).toHaveTextContent('Oct 1, 2026')
    expect(screen.getByText('Total').closest('tr')).toHaveTextContent(`$${(7243.67 - 240 - 2112.3).toLocaleString('en-US', { minimumFractionDigits: 2 })}`)
  })

  it('suggests adding accounts when there are none', async () => {
    accounts = []
    renderPage()

    expect(await screen.findByText(/Add each place you keep money/)).toBeInTheDocument()
  })

  it("adds a credit card, sending what's owed as a negative balance", async () => {
    renderPage()
    await screen.findByText('Checking')

    const form = screen.getByRole('form', { name: 'Add an account' })
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Meijer Card' } })
    fireEvent.change(within(form).getByLabelText('Type'), { target: { value: 'CREDIT_CARD' } })
    fireEvent.change(within(form).getByLabelText('Amount owed'), { target: { value: '493.26' } })
    fireEvent.change(within(form).getByLabelText('On'), { target: { value: '2026-11-01' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Add account' }))

    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true))
    expect(sent('POST')).toEqual({
      url: '/api/accounts',
      body: { name: 'Meijer Card', type: 'CREDIT_CARD', startingBalanceCents: -49326, startDate: '2026-11-01' },
    })
  })

  it('asks for a name before adding', async () => {
    renderPage()
    await screen.findByText('Checking')

    fireEvent.click(screen.getByRole('button', { name: 'Add account' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Give the account a name')
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })

  it('edits an account in place', async () => {
    renderPage()
    await screen.findByText('Checking')

    fireEvent.click(screen.getByRole('button', { name: 'Edit Amazon Card' }))
    const amount = screen.getByLabelText('Amount owed for Amazon Card')
    expect(amount).toHaveValue('200.00')
    fireEvent.change(amount, { target: { value: '150' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(true))
    expect(sent('PATCH')).toEqual({
      url: `/api/accounts/${card.id}`,
      body: { name: 'Amazon Card', type: 'CREDIT_CARD', startingBalanceCents: -15000, startDate: '2026-10-01' },
    })
  })

  it("says why an account with transactions can't be deleted", async () => {
    renderPage()
    await screen.findByText('Checking')

    fireEvent.click(screen.getByRole('button', { name: 'Delete Amazon Card' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This account has transactions. Move or delete them first.')
  })
})
