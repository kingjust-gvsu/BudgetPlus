import { useState } from 'react'
import { ApiError, apiGet, apiSend } from '../api/client'
import { useAuth } from '../auth/useAuth'
import { today } from '../dates'
import { formatCents } from '../money'
import './SettingsPage.css'

// What the user's chosen backup file holds, shown before they replace their data with it
type BackupFile = {
  name: string
  contents: unknown
  monthlyIncomeCents: number | null
  categories: number
  transactions: number
  firstDate: string | null
  lastDate: string | null
}

type RestoreResult = { categories: number; transactions: number }

// Reads just enough of a backup file to describe it; the server checks everything properly
function describeBackup(name: string, text: string): BackupFile | string {
  let contents: unknown
  try {
    contents = JSON.parse(text)
  } catch {
    return "That file isn't valid JSON."
  }
  const data = contents as Record<string, unknown>
  if (data?.format !== 'budget-plus-backup') return "That isn't a Budget+ backup file."
  const categories = Array.isArray(data.categories) ? data.categories : []
  const transactions = Array.isArray(data.transactions) ? (data.transactions as { date?: unknown }[]) : []
  const dates = transactions.map((t) => t.date).filter((d): d is string => typeof d === 'string').sort()
  return {
    name,
    contents,
    monthlyIncomeCents: typeof data.monthlyIncomeCents === 'number' ? data.monthlyIncomeCents : null,
    categories: categories.length,
    transactions: transactions.length,
    firstDate: dates[0] ?? null,
    lastDate: dates.at(-1) ?? null,
  }
}

export function SettingsPage() {
  const { getToken } = useAuth()
  const [exporting, setExporting] = useState(false)
  const [backupFile, setBackupFile] = useState<BackupFile | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const exportData = async () => {
    setError(null)
    setNotice(null)
    setExporting(true)
    try {
      const backup = await apiGet<unknown>('/backup', await getToken())
      // Hand the JSON to the browser as a file download
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `budget-plus-backup-${today()}.json`
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      setError("Couldn't export your data. Please try again.")
    } finally {
      setExporting(false)
    }
  }

  const chooseFile = async (file: File | undefined) => {
    setError(null)
    setNotice(null)
    setBackupFile(null)
    if (!file) return
    const described = describeBackup(file.name, await file.text())
    if (typeof described === 'string') setError(described)
    else setBackupFile(described)
  }

  const restore = async () => {
    if (!backupFile) return
    const confirmed = window.confirm(
      'Replace all of your data with this backup? Your current income, categories, and transactions will be deleted. This can’t be undone.',
    )
    if (!confirmed) return
    setError(null)
    setRestoring(true)
    try {
      const result = await apiSend<RestoreResult>('POST', '/backup/restore', await getToken(), backupFile.contents)
      setNotice(`Restored ${result.categories} categories and ${result.transactions} transactions from ${backupFile.name}.`)
      setBackupFile(null)
    } catch (restoreError) {
      setError(restoreError instanceof ApiError ? restoreError.message : 'The restore failed. Your data wasn’t changed.')
    } finally {
      setRestoring(false)
    }
  }

  return (
    <>
      <h1 className="page-title">Settings</h1>

      <section className="card" aria-labelledby="data-heading">
        <h2 id="data-heading">Your data</h2>

        <div className="settings-row">
          <div>
            <h3>Export</h3>
            <p className="muted small">Download your income, categories, budgets, and transactions as one JSON file.</p>
          </div>
          <button type="button" className="button" onClick={exportData} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export data'}
          </button>
        </div>

        <div className="settings-row">
          <div>
            <h3>Import a backup</h3>
            <p className="muted small">Replaces all of your current data with a backup file.</p>
          </div>
          <div className="field">
            <label htmlFor="backup-file" className="visually-hidden">
              Backup file
            </label>
            <input id="backup-file" type="file" accept=".json,application/json" onChange={(e) => chooseFile(e.target.files?.[0])} />
          </div>
        </div>

        {backupFile && (
          <div className="backup-preview">
            <p>
              <strong>{backupFile.name}</strong> has {backupFile.categories} categories and {backupFile.transactions}{' '}
              transactions
              {backupFile.firstDate && backupFile.lastDate && ` from ${backupFile.firstDate} to ${backupFile.lastDate}`}
              {backupFile.monthlyIncomeCents !== null && `, with income of ${formatCents(backupFile.monthlyIncomeCents)} a month`}.
            </p>
            <button type="button" className="button button-danger" onClick={restore} disabled={restoring}>
              {restoring ? 'Replacing…' : 'Replace my data with this backup'}
            </button>
          </div>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="success" role="status">
            {notice}
          </p>
        )}
      </section>
    </>
  )
}
