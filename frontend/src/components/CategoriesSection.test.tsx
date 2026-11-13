import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Category } from '../api/types'
import { AuthContext, type AuthState } from '../auth/authContext'
import { CategoriesSection } from './CategoriesSection'

let categories: Category[]
let fetchMock: ReturnType<typeof vi.fn>

// A tiny stand-in for the categories API, keeping categories in memory
function fakeApi(url: string, init?: RequestInit) {
  const method = init?.method ?? 'GET'
  const body = init?.body ? JSON.parse(String(init.body)) : undefined
  if (method === 'GET') return Response.json([...categories].sort((a, b) => a.name.localeCompare(b.name)))
  if (method === 'POST') {
    if (categories.some((c) => c.name === body.name)) {
      return Response.json({ error: 'You already have a category with that name' }, { status: 409 })
    }
    const created = { id: `cat-${categories.length + 1}`, ...body }
    categories = [...categories, created]
    return Response.json(created, { status: 201 })
  }
  if (method === 'PATCH') {
    categories = categories.map((c) => (url.endsWith(c.id) ? { ...c, ...body } : c))
    return Response.json(categories.find((c) => url.endsWith(c.id)))
  }
  if (method === 'DELETE') {
    categories = categories.filter((c) => !url.endsWith(c.id))
    return new Response(null, { status: 204 })
  }
  return Response.json({ error: 'Not found' }, { status: 404 })
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
      <CategoriesSection />
    </AuthContext.Provider>,
  )
}

function addCategory(name: string, kind: 'Bill' | 'Expense') {
  const form = screen.getByRole('form', { name: 'Add a category' })
  fireEvent.change(within(form).getByLabelText('Name'), { target: { value: name } })
  fireEvent.change(within(form).getByLabelText('Kind'), { target: { value: kind.toUpperCase() } })
  fireEvent.click(within(form).getByRole('button', { name: 'Add' }))
}

describe('CategoriesSection', () => {
  beforeEach(() => {
    categories = [
      { id: 'cat-rent', name: 'Rent', kind: 'BILL' },
      { id: 'cat-groceries', name: 'Groceries', kind: 'EXPENSE' },
    ]
    fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(fakeApi(url, init)))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('lists categories with their kind', async () => {
    renderSection()

    const rent = (await screen.findByText('Rent')).closest('tr')!
    expect(within(rent).getByText('Bill')).toBeInTheDocument()
    const groceries = screen.getByText('Groceries').closest('tr')!
    expect(within(groceries).getByText('Expense')).toBeInTheDocument()
  })

  it('adds a category', async () => {
    renderSection()
    await screen.findByText('Rent')

    addCategory('Electric', 'Bill')

    const electric = (await screen.findByText('Electric')).closest('tr')!
    expect(within(electric).getByText('Bill')).toBeInTheDocument()
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(JSON.parse(post[1].body)).toEqual({ name: 'Electric', kind: 'BILL' })
  })

  it("shows the API's message for a duplicate name", async () => {
    renderSection()
    await screen.findByText('Rent')

    addCategory('Rent', 'Bill')

    expect(await screen.findByRole('alert')).toHaveTextContent('You already have a category with that name')
  })

  it('renames a category in place', async () => {
    renderSection()
    await screen.findByText('Groceries')

    fireEvent.click(screen.getByRole('button', { name: 'Edit Groceries' }))
    fireEvent.change(screen.getByLabelText('Name for Groceries'), { target: { value: 'Food' } })
    fireEvent.keyDown(screen.getByLabelText('Name for Groceries'), { key: 'Enter' })

    expect(await screen.findByText('Food')).toBeInTheDocument()
    expect(screen.queryByLabelText('Name for Groceries')).not.toBeInTheDocument()
  })

  it('deletes a category after confirming', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderSection()
    await screen.findByText('Rent')

    fireEvent.click(screen.getByRole('button', { name: 'Delete Rent' }))

    await vi.waitFor(() => expect(screen.queryByText('Rent')).not.toBeInTheDocument())
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('uncategorized'))
  })

  it('keeps the category when deletion is not confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderSection()
    await screen.findByText('Rent')

    fireEvent.click(screen.getByRole('button', { name: 'Delete Rent' }))

    expect(screen.getByText('Rent')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)
  })
})
