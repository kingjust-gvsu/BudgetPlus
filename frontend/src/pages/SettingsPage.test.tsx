import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import { SettingsPage } from './SettingsPage'

const backup = {
  format: 'budget-plus-backup',
  version: 1,
  exportedAt: '2026-11-13T12:00:00.000Z',
  monthlyIncomeCents: 400000,
  categories: [{ name: 'Rent', kind: 'BILL' }, { name: 'Groceries', kind: 'EXPENSE' }],
  transactions: [
    { date: '2026-09-01', description: 'Landlord', amountCents: 120000, category: 'Rent' },
    { date: '2026-11-05', description: 'Meijer', amountCents: 8400, category: 'Groceries' },
  ],
}

function renderSettings(fetchImpl: (url: string, init?: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn(fetchImpl)
  vi.stubGlobal('fetch', fetchMock)
  const auth: AuthState = {
    user: { email: 'test@example.com', displayName: 'Test User' },
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    getToken: vi.fn().mockResolvedValue('test-token'),
  }
  render(
    <MemoryRouter>
      <AuthContext.Provider value={auth}>
        <SettingsPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
  return fetchMock
}

const chooseBackup = (contents: string) =>
  fireEvent.change(screen.getByLabelText('Backup file'), {
    target: { files: [new File([contents], 'my-backup.json', { type: 'application/json' })] },
  })

describe('SettingsPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('describes a chosen backup before anything is replaced', async () => {
    const fetchMock = renderSettings(() => Promise.resolve(Response.json({})))

    chooseBackup(JSON.stringify(backup))

    expect(await screen.findByText(/has 2 categories and 2 transactions from 2026-09-01 to 2026-11-05, with income of \$4,000\.00 a month/)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('describes the income in a version 2 backup', async () => {
    renderSettings(() => Promise.resolve(Response.json({})))

    const { monthlyIncomeCents: _old, ...rest } = backup
    chooseBackup(JSON.stringify({ ...rest, version: 2, income: { sources: [{ name: 'A', amounts: [] }, { name: 'B', amounts: [] }], other: [] } }))

    expect(await screen.findByText(/with 2 income sources\./)).toBeInTheDocument()
  })

  it('replaces the data after the user confirms', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const fetchMock = renderSettings(() => Promise.resolve(Response.json({ categories: 2, transactions: 2 })))
    chooseBackup(JSON.stringify(backup))

    fireEvent.click(await screen.findByRole('button', { name: 'Replace my data with this backup' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Restored 2 categories and 2 transactions from my-backup.json.')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/backup/restore')
    expect(JSON.parse(String(init?.body))).toEqual(backup)
  })

  it('does nothing if the user cancels', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const fetchMock = renderSettings(() => Promise.resolve(Response.json({})))
    chooseBackup(JSON.stringify(backup))

    fireEvent.click(await screen.findByRole('button', { name: 'Replace my data with this backup' }))

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("shows the server's reason when a backup is rejected", async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderSettings(() => Promise.resolve(Response.json({ error: 'Only one category can be the remainder' }, { status: 400 })))
    chooseBackup(JSON.stringify(backup))

    fireEvent.click(await screen.findByRole('button', { name: 'Replace my data with this backup' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Only one category can be the remainder')
  })

  it.each([
    ['a file that is not JSON', 'not json', "That file isn't valid JSON."],
    ['JSON that is not a backup', '{"hello":"world"}', "That isn't a Budget+ backup file."],
  ])('explains %s', async (_case, contents, message) => {
    renderSettings(() => Promise.resolve(Response.json({})))

    chooseBackup(contents)

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
  })

  it('downloads the export as a dated JSON file', async () => {
    renderSettings(() => Promise.resolve(Response.json(backup)))
    URL.createObjectURL = vi.fn(() => 'blob:backup')
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    fireEvent.click(screen.getByRole('button', { name: 'Export data' }))

    await vi.waitFor(() => expect(click).toHaveBeenCalled())
    const link = click.mock.contexts[0] as HTMLAnchorElement
    expect(link.download).toMatch(/^budget-plus-backup-\d{4}-\d{2}-\d{2}\.json$/)
  })
})
