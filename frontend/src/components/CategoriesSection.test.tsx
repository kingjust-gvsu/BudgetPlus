import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Category } from '../api/types'
import { AuthContext, type AuthState } from '../auth/authContext'
import { makeCategory } from '../test/factories'
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
    const created = makeCategory({ id: `cat-${categories.length + 1}`, ...body })
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
      makeCategory({ id: 'cat-rent', name: 'Rent', kind: 'BILL', budgetCents: 120000 }),
      makeCategory({ id: 'cat-groceries', name: 'Groceries', kind: 'EXPENSE' }),
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
    expect(JSON.parse(post[1].body)).toEqual({
      name: 'Electric',
      kind: 'BILL',
      budgetType: 'FIXED',
      budgetCents: null,
      budgetPercent: null,
      frequencyMonths: 1,
      nextDueDate: null,
    })
  })

  it('sets the budget while adding a category', async () => {
    renderSection()
    await screen.findByText('Rent')
    const form = screen.getByRole('form', { name: 'Add a category' })

    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Car insurance' } })
    fireEvent.change(within(form).getByLabelText('Kind'), { target: { value: 'BILL' } })
    expect(within(form).queryByLabelText('Budget as')).not.toBeInTheDocument()
    fireEvent.change(within(form).getByLabelText('Estimate ($)'), { target: { value: '600' } })
    fireEvent.change(within(form).getByLabelText('How often'), { target: { value: '6' } })
    fireEvent.change(within(form).getByLabelText('Next due'), { target: { value: '2027-03-15' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Add' }))

    const row = (await screen.findByText('Car insurance')).closest('tr')!
    expect(within(row).getByText('Est. $600.00 every 6 months')).toBeInTheDocument()
    expect(within(form).getByLabelText('Name')).toHaveValue('')
  })

  it('adds an expense as a percent of income', async () => {
    renderSection()
    await screen.findByText('Rent')
    const form = screen.getByRole('form', { name: 'Add a category' })

    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Eating out' } })
    fireEvent.change(within(form).getByLabelText('Budget as'), { target: { value: 'PERCENT_OF_INCOME' } })
    fireEvent.change(within(form).getByLabelText('Percent of income'), { target: { value: '5' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('5% of income')).toBeInTheDocument()
  })

  it('disables Remainder once another category is the remainder, except on that category', async () => {
    categories.push(makeCategory({ id: 'cat-savings', name: 'Savings', kind: 'EXPENSE', budgetType: 'REMAINDER' }))
    renderSection()
    const savingsRow = (await screen.findByText('Savings')).closest('tr')!
    expect(within(savingsRow).getByText('Remainder')).toBeInTheDocument()

    const form = screen.getByRole('form', { name: 'Add a category' })
    expect(within(form).getByRole('option', { name: 'Remainder (already used)' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Edit Groceries' }))
    const groceriesType = screen.getByLabelText('Budget as for Groceries')
    expect(within(groceriesType).getByRole('option', { name: 'Remainder (already used)' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    fireEvent.click(screen.getByRole('button', { name: 'Edit Savings' }))
    const savingsType = screen.getByLabelText('Budget as for Savings')
    expect(within(savingsType).getByRole('option', { name: 'Remainder' })).toBeEnabled()
  })

  it('keeps the remainder an expense by locking Kind', async () => {
    renderSection()
    await screen.findByText('Rent')
    const form = screen.getByRole('form', { name: 'Add a category' })

    fireEvent.change(within(form).getByLabelText('Budget as'), { target: { value: 'REMAINDER' } })
    expect(within(form).getByLabelText('Kind')).toBeDisabled()

    fireEvent.change(within(form).getByLabelText('Budget as'), { target: { value: 'FIXED' } })
    expect(within(form).getByLabelText('Kind')).toBeEnabled()
  })

  it('shows and clears problems while typing, before Add is clicked', async () => {
    renderSection()
    await screen.findByText('Rent')
    const form = screen.getByRole('form', { name: 'Add a category' })

    fireEvent.change(within(form).getByLabelText('Amount ($)'), { target: { value: '12x' } })
    expect(screen.getByRole('alert')).toHaveTextContent('Enter an amount like 480 or 480.00.')

    fireEvent.change(within(form).getByLabelText('Amount ($)'), { target: { value: '12' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it("doesn't complain about fields that haven't been typed in until Add is clicked", async () => {
    renderSection()
    await screen.findByText('Rent')
    const form = screen.getByRole('form', { name: 'Add a category' })

    fireEvent.change(within(form).getByLabelText('Budget as'), { target: { value: 'PERCENT_OF_INCOME' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    fireEvent.click(within(form).getByRole('button', { name: 'Add' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a name.')
  })

  it('shows problems in an edited row as you type', async () => {
    renderSection()
    await screen.findByText('Groceries')

    fireEvent.click(screen.getByRole('button', { name: 'Edit Groceries' }))
    fireEvent.change(screen.getByLabelText('Budget as for Groceries'), { target: { value: 'PERCENT_OF_INCOME' } })
    fireEvent.change(screen.getByLabelText('Percent of income for Groceries'), { target: { value: '150' } })
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a percent above 0 and up to 100.')

    fireEvent.change(screen.getByLabelText('Percent of income for Groceries'), { target: { value: '15' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('warns as you type when percent budgets would total more than 100%', async () => {
    categories.push(
      makeCategory({ id: 'cat-savings', name: 'Savings', kind: 'EXPENSE', budgetType: 'PERCENT_OF_INCOME', budgetPercent: 60 }),
    )
    renderSection()
    await screen.findByText('Groceries')

    fireEvent.click(screen.getByRole('button', { name: 'Edit Groceries' }))
    fireEvent.change(screen.getByLabelText('Budget as for Groceries'), { target: { value: 'PERCENT_OF_INCOME' } })
    fireEvent.change(screen.getByLabelText('Percent of income for Groceries'), { target: { value: '45' } })
    expect(screen.getByRole('alert')).toHaveTextContent('Percent budgets would total 105% of income. The most is 100%.')

    fireEvent.change(screen.getByLabelText('Percent of income for Groceries'), { target: { value: '40' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it("doesn't count the edited category's own old percent", async () => {
    categories.push(
      makeCategory({ id: 'cat-savings', name: 'Savings', kind: 'EXPENSE', budgetType: 'PERCENT_OF_INCOME', budgetPercent: 60 }),
    )
    renderSection()
    await screen.findByText('Savings')

    fireEvent.click(screen.getByRole('button', { name: 'Edit Savings' }))
    fireEvent.change(screen.getByLabelText('Percent of income for Savings'), { target: { value: '90' } })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
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

  it('describes each budget, or shows that it is not set', async () => {
    renderSection()

    const rent = (await screen.findByText('Rent')).closest('tr')!
    expect(within(rent).getByText('Est. $1,200.00 a month')).toBeInTheDocument()
    const groceries = screen.getByText('Groceries').closest('tr')!
    expect(within(groceries).getByText('Not set')).toBeInTheDocument()
  })

  it('sets an expense to a percent of income', async () => {
    renderSection()
    await screen.findByText('Groceries')

    fireEvent.click(screen.getByRole('button', { name: 'Edit Groceries' }))
    fireEvent.change(screen.getByLabelText('Budget as for Groceries'), { target: { value: 'PERCENT_OF_INCOME' } })
    fireEvent.change(screen.getByLabelText('Percent of income for Groceries'), { target: { value: '12.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('12.5% of income')).toBeInTheDocument()
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')!
    expect(JSON.parse(patch[1].body)).toEqual({
      name: 'Groceries',
      kind: 'EXPENSE',
      budgetType: 'PERCENT_OF_INCOME',
      budgetCents: null,
      budgetPercent: 12.5,
      frequencyMonths: 1,
      nextDueDate: null,
    })
  })

  it('gives a bill a schedule, asking for a due date only when it is not monthly', async () => {
    renderSection()
    await screen.findByText('Rent')

    fireEvent.click(screen.getByRole('button', { name: 'Edit Rent' }))
    expect(screen.queryByLabelText('Budget as for Rent')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Next due for Rent')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Name for Rent'), { target: { value: 'Car insurance' } })
    fireEvent.change(screen.getByLabelText('Estimate ($) for Rent'), { target: { value: '600' } })
    fireEvent.change(screen.getByLabelText('How often for Rent'), { target: { value: '6' } })
    fireEvent.change(screen.getByLabelText('Next due for Rent'), { target: { value: '2027-03-15' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    const row = (await screen.findByText('Car insurance')).closest('tr')!
    expect(within(row).getByText('Est. $600.00 every 6 months')).toBeInTheDocument()
    expect(within(row).getByText('Next due March 15, 2027')).toBeInTheDocument()
  })

  it("explains a percent it can't read without calling the API", async () => {
    renderSection()
    await screen.findByText('Groceries')

    fireEvent.click(screen.getByRole('button', { name: 'Edit Groceries' }))
    fireEvent.change(screen.getByLabelText('Budget as for Groceries'), { target: { value: 'PERCENT_OF_INCOME' } })
    fireEvent.change(screen.getByLabelText('Percent of income for Groceries'), { target: { value: 'lots' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a percent like 12 or 12.5')
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false)
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
