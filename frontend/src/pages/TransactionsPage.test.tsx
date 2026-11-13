import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Category, Transaction } from '../api/types'
import { AuthContext, type AuthState } from '../auth/authContext'
import { monthOf, shiftMonth, today } from '../dates'
import { makeCategory } from '../test/factories'
import { TransactionsPage } from './TransactionsPage'

const thisMonth = monthOf(today())

const categories: Category[] = [makeCategory({ id: 'cat-groceries', name: 'Groceries', kind: 'EXPENSE' })]

let transactions: Transaction[]
let fetchMock: ReturnType<typeof vi.fn>

// A tiny stand-in for the API: lists, creates, edits, and deletes transactions in memory
function fakeApi(url: string, init?: RequestInit) {
  const method = init?.method ?? 'GET'
  if (method === 'GET' && url.startsWith('/api/transactions')) return Response.json(transactions)
  if (method === 'GET' && url === '/api/categories') return Response.json(categories)
  if (method === 'POST' && url === '/api/transactions') {
    const created = { id: `tx-${transactions.length + 1}`, ...JSON.parse(String(init?.body)) }
    transactions = [created, ...transactions]
    return Response.json(created, { status: 201 })
  }
  if (method === 'PATCH') {
    const changes = JSON.parse(String(init?.body))
    transactions = transactions.map((t) => (url.endsWith(t.id) ? { ...t, ...changes } : t))
    return Response.json(transactions.find((t) => url.endsWith(t.id)))
  }
  if (method === 'DELETE') {
    transactions = transactions.filter((t) => !url.endsWith(t.id))
    return new Response(null, { status: 204 })
  }
  return Response.json({ error: 'Not found' }, { status: 404 })
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
      <TransactionsPage />
    </AuthContext.Provider>,
  )
}

function fillForm(fields: { description?: string; amount?: string; category?: string }) {
  const form = screen.getByRole('form', { name: 'Add a transaction' })
  if (fields.description !== undefined) {
    fireEvent.change(within(form).getByLabelText('Description'), { target: { value: fields.description } })
  }
  if (fields.amount !== undefined) {
    fireEvent.change(within(form).getByLabelText('Amount ($)'), { target: { value: fields.amount } })
  }
  if (fields.category !== undefined) {
    fireEvent.change(within(form).getByLabelText('Category'), { target: { value: fields.category } })
  }
  fireEvent.click(within(form).getByRole('button', { name: 'Add' }))
}

describe('TransactionsPage', () => {
  beforeEach(() => {
    transactions = [
      { id: 'tx-meijer', date: `${thisMonth}-15`, description: 'Meijer', amountCents: 8412, categoryId: 'cat-groceries' },
      { id: 'tx-refund', date: `${thisMonth}-08`, description: 'Target refund', amountCents: -1800, categoryId: null },
    ]
    fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(fakeApi(url, init)))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("lists this month's transactions with their categories and amounts", async () => {
    renderPage()

    const meijer = (await screen.findByText('Meijer')).closest('tr')!
    expect(within(meijer).getByText('Groceries')).toBeInTheDocument()
    expect(within(meijer).getByText('$84.12')).toBeInTheDocument()
    const refund = screen.getByText('Target refund').closest('tr')!
    expect(within(refund).getByText('Uncategorized')).toBeInTheDocument()
    expect(within(refund).getByText('-$18.00')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(`/api/transactions?month=${thisMonth}`, expect.anything())
  })

  it('adds a transaction, sending the amount in cents', async () => {
    renderPage()
    await screen.findByText('Meijer')

    fillForm({ description: 'Pizza place', amount: '32.75', category: 'cat-groceries' })

    expect(await screen.findByText('Pizza place')).toBeInTheDocument()
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(JSON.parse(post[1].body)).toEqual({
      date: today(),
      description: 'Pizza place',
      amountCents: 3275,
      categoryId: 'cat-groceries',
    })
  })

  it('explains an amount it cannot read, without calling the API', async () => {
    renderPage()
    await screen.findByText('Meijer')

    fillForm({ description: 'Pizza place', amount: 'twelve' })

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter an amount like 12.34')
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })

  it('shows the error message the API sends back', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      Promise.resolve(
        init?.method === 'POST'
          ? Response.json({ error: 'Date is not a real date' }, { status: 400 })
          : fakeApi(url, init),
      ),
    )
    renderPage()
    await screen.findByText('Meijer')

    fillForm({ description: 'Pizza place', amount: '10' })

    expect(await screen.findByRole('alert')).toHaveTextContent('Date is not a real date')
  })

  it('edits a transaction in place', async () => {
    renderPage()
    await screen.findByText('Meijer')

    fireEvent.click(screen.getByRole('button', { name: 'Edit Meijer' }))
    fireEvent.change(screen.getByLabelText('Amount for Meijer'), { target: { value: '90' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('$90.00')).toBeInTheDocument()
    expect(screen.queryByLabelText('Amount for Meijer')).not.toBeInTheDocument()
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')!
    expect(patch[0]).toBe('/api/transactions/tx-meijer')
    expect(JSON.parse(patch[1].body)).toMatchObject({ amountCents: 9000, categoryId: 'cat-groceries' })
  })

  it('saves an edit with Enter and cancels with Escape', async () => {
    renderPage()
    await screen.findByText('Meijer')

    fireEvent.click(screen.getByRole('button', { name: 'Edit Meijer' }))
    fireEvent.keyDown(screen.getByLabelText('Description for Meijer'), { key: 'Escape' })
    expect(screen.queryByLabelText('Description for Meijer')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Edit Meijer' }))
    fireEvent.change(screen.getByLabelText('Description for Meijer'), { target: { value: 'Meijer gas' } })
    fireEvent.keyDown(screen.getByLabelText('Description for Meijer'), { key: 'Enter' })

    expect(await screen.findByText('Meijer gas')).toBeInTheDocument()
  })

  it('keeps the row open and explains the problem when an edit is invalid', async () => {
    renderPage()
    await screen.findByText('Meijer')

    fireEvent.click(screen.getByRole('button', { name: 'Edit Meijer' }))
    fireEvent.change(screen.getByLabelText('Amount for Meijer'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter an amount like 12.34')
    expect(screen.getByLabelText('Amount for Meijer')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false)
  })

  it('deletes a transaction after confirming', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPage()
    await screen.findByText('Meijer')

    fireEvent.click(screen.getByRole('button', { name: 'Delete Meijer' }))

    await vi.waitFor(() => expect(screen.queryByText('Meijer')).not.toBeInTheDocument())
  })

  it('loads the previous month', async () => {
    renderPage()
    await screen.findByText('Meijer')

    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(`/api/transactions?month=${shiftMonth(thisMonth, -1)}`, expect.anything()),
    )
  })
})
