import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import { makeCategory } from '../test/factories'
import { CsvImport } from './CsvImport'

const categories = [makeCategory({ id: 'groceries', name: 'Groceries', kind: 'EXPENSE' })]

const bankFile = [
  'Posting Date,Description,Amount,Category',
  '10/15/2026,MEIJER #123,-84.12,Groceries',
  '10/16/2026,SHELL OIL,-48.30,Gas',
  '10/16/2026,PAYROLL DEPOSIT,2000.00,',
  '10/17/2026,SQ *COFFEE,-6.50,',
  'not a date,BROKEN ROW,-1.00,',
].join('\n')

function renderImport(fetchImpl: (url: string, init?: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn(fetchImpl)
  vi.stubGlobal('fetch', fetchMock)
  const onImported = vi.fn()
  const auth: AuthState = {
    user: { email: 'test@example.com', displayName: 'Test User' },
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    getToken: vi.fn().mockResolvedValue('test-token'),
  }
  render(
    <AuthContext.Provider value={auth}>
      <CsvImport categories={categories} onImported={onImported} onCancel={vi.fn()} />
    </AuthContext.Provider>,
  )
  return { fetchMock, onImported }
}

function chooseFile(contents: string) {
  const file = new File([contents], 'october.csv', { type: 'text/csv' })
  fireEvent.change(screen.getByLabelText('CSV file from your bank'), { target: { files: [file] } })
}

describe('CsvImport', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('guesses the columns and previews what will be imported', async () => {
    renderImport(() => Promise.resolve(Response.json({})))

    chooseFile(bankFile)

    expect(await screen.findByText('3 ready to import')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('1 with problems · 1 money coming in left out')
    expect(screen.getByLabelText('Date')).toHaveValue('Posting Date')
    expect(screen.getByLabelText('Money spent shows as')).toHaveValue('negative')
    expect(screen.getByText(/Line 6: Can't read the date/)).toBeInTheDocument()
    expect(screen.getByText(/don't match yours.*Gas/)).toBeInTheDocument()
    expect(screen.getByText('$84.12')).toBeInTheDocument()
  })

  it('sends the ready rows and reports how many were imported and skipped', async () => {
    const { fetchMock, onImported } = renderImport(() =>
      Promise.resolve(Response.json({ imported: 2, duplicates: 1 }, { status: 201 })),
    )
    chooseFile(bankFile)

    fireEvent.click(await screen.findByRole('button', { name: 'Import 3 transactions' }))

    await vi.waitFor(() => expect(onImported).toHaveBeenCalledWith('Imported 2 transactions from october.csv. 1 you already had was skipped.'))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/transactions/import')
    expect(JSON.parse(String(init?.body)).transactions).toEqual([
      { date: '2026-10-15', description: 'MEIJER #123', amountCents: 8412, categoryId: 'groceries' },
      { date: '2026-10-16', description: 'SHELL OIL', amountCents: 4830, categoryId: null },
      { date: '2026-10-17', description: 'SQ *COFFEE', amountCents: 650, categoryId: null },
    ])
  })

  it('can include money coming in', async () => {
    renderImport(() => Promise.resolve(Response.json({})))
    chooseFile(bankFile)
    await screen.findByText('3 ready to import')

    fireEvent.click(screen.getByLabelText(/Leave out money coming in/))

    expect(screen.getByText('4 ready to import')).toBeInTheDocument()
  })

  it("shows the server's message if the import is rejected", async () => {
    renderImport(() => Promise.resolve(Response.json({ error: '1 row(s) have problems' }, { status: 400 })))
    chooseFile(bankFile)

    fireEvent.click(await screen.findByRole('button', { name: 'Import 3 transactions' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('1 row(s) have problems')
  })

  it('explains a file that is not a usable CSV', async () => {
    renderImport(() => Promise.resolve(Response.json({})))

    chooseFile('just some text')

    expect(await screen.findByRole('alert')).toHaveTextContent("doesn't look like a CSV")
  })
})
