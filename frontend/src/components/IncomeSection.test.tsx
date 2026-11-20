import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MonthIncome } from '../api/types'
import { AuthContext, type AuthState } from '../auth/authContext'
import { formatMonth, monthOf, shiftMonth, today } from '../dates'
import { IncomeSection } from './IncomeSection'

const thisMonth = monthOf(today())
const lastMonth = shiftMonth(thisMonth, -1)

let fetchMock: ReturnType<typeof vi.fn>

const november: MonthIncome = {
  month: thisMonth,
  sources: [
    { id: 'job-1', name: 'Income 1', amountCents: 260000, setIn: '2026-01' },
    { id: 'job-2', name: 'Income 2', amountCents: 180000, setIn: thisMonth },
  ],
  otherCents: 0,
  totalCents: 440000,
}

// Answers every request with the month asked for (or the one changed), like the API does
function renderSection(answer: (url: string, init?: RequestInit) => MonthIncome = () => november) {
  fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(Response.json(answer(url, init))))
  vi.stubGlobal('fetch', fetchMock)
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

const row = (name: string) => screen.getByText(name, { selector: '.income-name' }).closest('li')!
const lastCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1)!
  return { url, method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined }
}

describe('IncomeSection', () => {
  beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("shows this month's sources, Other, and the total", async () => {
    renderSection()

    expect(await screen.findByText(formatMonth(thisMonth))).toBeInTheDocument()
    expect(row('Income 1')).toHaveTextContent('$2,600.00')
    expect(row('Income 2')).toHaveTextContent('$1,800.00')
    expect(row('Other')).toHaveTextContent('$0.00')
    expect(row('Total')).toHaveTextContent('$4,400.00')
    expect(fetchMock).toHaveBeenCalledWith(`/api/income?month=${thisMonth}`, expect.anything())
  })

  it('loads another month with the arrows', async () => {
    renderSection()
    await screen.findByText('Income 1')

    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))

    expect(screen.getByText(formatMonth(lastMonth))).toBeInTheDocument()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/income?month=${lastMonth}`, expect.anything()))
  })

  it('changes a source from this month on, in cents', async () => {
    renderSection()
    await screen.findByText('Income 1')

    fireEvent.click(screen.getByRole('button', { name: 'Edit Income 1' }))
    expect(screen.getByText(`Applies to ${formatMonth(thisMonth)} and later months.`)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Amount ($)'), { target: { value: '2,800' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await vi.waitFor(() => expect(lastCall().method).toBe('PATCH'))
    expect(lastCall()).toEqual({
      url: '/api/income/sources/job-1',
      method: 'PATCH',
      body: { month: thisMonth, name: 'Income 1', amountCents: 280000 },
    })
  })

  it("sets this month's other income", async () => {
    renderSection()
    await screen.findByText('Income 1')

    fireEvent.click(screen.getByRole('button', { name: 'Edit other income' }))
    fireEvent.change(screen.getByLabelText('Amount ($)'), { target: { value: '1500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await vi.waitFor(() => expect(lastCall().method).toBe('PUT'))
    expect(lastCall().body).toEqual({ month: thisMonth, amountCents: 150000 })
  })

  it('adds a source starting this month', async () => {
    renderSection()
    await screen.findByText('Income 1')

    fireEvent.click(screen.getByRole('button', { name: '+ Add income source' }))
    const form = screen.getByRole('form', { name: 'Add income source' })
    fireEvent.change(within(form).getByLabelText('Income name'), { target: { value: 'Side gig' } })
    fireEvent.change(within(form).getByLabelText('Amount ($)'), { target: { value: '300' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }))

    await vi.waitFor(() => expect(lastCall().method).toBe('POST'))
    expect(lastCall()).toEqual({ url: '/api/income/sources', method: 'POST', body: { name: 'Side gig', amountCents: 30000, month: thisMonth } })
  })

  it('removes a source from this month on after confirming', async () => {
    renderSection()
    await screen.findByText('Income 1')

    fireEvent.click(screen.getByRole('button', { name: 'Delete Income 2' }))

    expect(window.confirm).toHaveBeenCalledWith(`Remove "Income 2" from ${formatMonth(thisMonth)} on? Earlier months keep it.`)
    await vi.waitFor(() => expect(lastCall().method).toBe('DELETE'))
    expect(lastCall().url).toBe(`/api/income/sources/job-2?month=${thisMonth}`)
  })

  it('explains an amount it cannot read, without calling the API', async () => {
    renderSection()
    await screen.findByText('Income 1')
    const calls = fetchMock.mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: 'Edit other income' }))
    fireEvent.change(screen.getByLabelText('Amount ($)'), { target: { value: 'lots' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Enter an amount like 2600 or 2,600.00.')
    expect(fetchMock.mock.calls.length).toBe(calls)
  })

  it('invites adding income when there is none yet', async () => {
    renderSection(() => ({ month: thisMonth, sources: [], otherCents: 0, totalCents: null }))

    expect(await screen.findByText('Add each regular income, like each paycheck in your household.')).toBeInTheDocument()
  })
})
