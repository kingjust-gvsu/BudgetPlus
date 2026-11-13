import { useMemo, useState } from 'react'
import { ApiError, apiSend } from '../api/client'
import type { Category } from '../api/types'
import { useAuth } from '../auth/useAuth'
import { guessMapping, previewImport, readCsv, type ColumnMapping, type CsvFile } from '../csvImport'
import { formatDay } from '../dates'
import { formatCents } from '../money'
import './CsvImport.css'

type Props = {
  categories: Category[]
  // Called after a successful import with a message to show
  onImported: (message: string) => void
  onCancel: () => void
}

type ImportResult = { imported: number; duplicates: number }

const PREVIEW_ROWS = 8

// Import transactions from a bank's CSV export: choose a file, say which column is which,
// check the preview, then import.
export function CsvImport({ categories, onImported, onCancel }: Props) {
  const { getToken } = useAuth()
  const [fileName, setFileName] = useState<string | null>(null)
  const [file, setFile] = useState<CsvFile | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  const preview = useMemo(
    () => (file && mapping ? previewImport(file, mapping, categories) : null),
    [file, mapping, categories],
  )
  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name

  const chooseFile = async (chosen: File | undefined) => {
    setError(null)
    if (!chosen) return
    const parsed = readCsv(await chosen.text())
    if (parsed.headers.length < 2 || parsed.rows.length === 0) {
      setError("That file doesn't look like a CSV with a header row and transactions.")
      return
    }
    setFileName(chosen.name)
    setFile(parsed)
    setMapping(guessMapping(parsed))
  }

  const update = (changes: Partial<ColumnMapping>) => mapping && setMapping({ ...mapping, ...changes })

  const runImport = async () => {
    if (!preview || preview.ready.length === 0) return
    setError(null)
    setImporting(true)
    try {
      const transactions = preview.ready.map(({ line: _line, ...t }) => t)
      const result = await apiSend<ImportResult>('POST', '/transactions/import', await getToken(), { transactions })
      const skipped = result.duplicates > 0 ? ` ${result.duplicates} you already had ${result.duplicates === 1 ? 'was' : 'were'} skipped.` : ''
      onImported(`Imported ${result.imported} transaction${result.imported === 1 ? '' : 's'} from ${fileName}.${skipped}`)
    } catch (importError) {
      setError(importError instanceof ApiError ? importError.message : 'The import failed. Please try again.')
      setImporting(false)
    }
  }

  const headerOptions = (file?.headers ?? []).map((h) => (
    <option key={h} value={h}>
      {h}
    </option>
  ))

  return (
    <section className="card csv-import" aria-labelledby="csv-import-heading">
      <div className="csv-import-top">
        <h2 id="csv-import-heading">Import from a bank CSV</h2>
        <button type="button" className="link-button" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <div className="field">
        <label htmlFor="csv-file">CSV file from your bank</label>
        <input id="csv-file" type="file" accept=".csv,text/csv" onChange={(e) => chooseFile(e.target.files?.[0])} />
      </div>

      {file && mapping && (
        <>
          <h3 className="csv-step">Match the columns</h3>
          <div className="form-row">
            <div className="field">
              <label htmlFor="csv-date">Date</label>
              <select id="csv-date" value={mapping.dateColumn} onChange={(e) => update({ dateColumn: e.target.value })}>
                {headerOptions}
              </select>
            </div>
            <div className="field">
              <label htmlFor="csv-description">Description</label>
              <select
                id="csv-description"
                value={mapping.descriptionColumn}
                onChange={(e) => update({ descriptionColumn: e.target.value })}
              >
                {headerOptions}
              </select>
            </div>
            <div className="field">
              <label htmlFor="csv-amount-format">Amounts are in</label>
              <select
                id="csv-amount-format"
                value={mapping.amount.kind}
                onChange={(e) =>
                  update({
                    amount:
                      e.target.value === 'split'
                        ? { kind: 'split', debitColumn: file.headers[0], creditColumn: file.headers[0] }
                        : { kind: 'single', column: file.headers[0], spendingIs: 'negative' },
                  })
                }
              >
                <option value="single">One amount column</option>
                <option value="split">Debit and credit columns</option>
              </select>
            </div>
            {mapping.amount.kind === 'single' ? (
              <>
                <div className="field">
                  <label htmlFor="csv-amount">Amount</label>
                  <select
                    id="csv-amount"
                    value={mapping.amount.column}
                    onChange={(e) => mapping.amount.kind === 'single' && update({ amount: { ...mapping.amount, column: e.target.value } })}
                  >
                    {headerOptions}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="csv-sign">Money spent shows as</label>
                  <select
                    id="csv-sign"
                    value={mapping.amount.spendingIs}
                    onChange={(e) =>
                      mapping.amount.kind === 'single' &&
                      update({ amount: { ...mapping.amount, spendingIs: e.target.value as 'negative' | 'positive' } })
                    }
                  >
                    <option value="negative">Negative numbers</option>
                    <option value="positive">Positive numbers</option>
                  </select>
                </div>
              </>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="csv-debit">Money out (debit)</label>
                  <select
                    id="csv-debit"
                    value={mapping.amount.debitColumn}
                    onChange={(e) => mapping.amount.kind === 'split' && update({ amount: { ...mapping.amount, debitColumn: e.target.value } })}
                  >
                    {headerOptions}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="csv-credit">Money in (credit)</label>
                  <select
                    id="csv-credit"
                    value={mapping.amount.creditColumn}
                    onChange={(e) => mapping.amount.kind === 'split' && update({ amount: { ...mapping.amount, creditColumn: e.target.value } })}
                  >
                    {headerOptions}
                  </select>
                </div>
              </>
            )}
            <div className="field">
              <label htmlFor="csv-category">Category (optional)</label>
              <select
                id="csv-category"
                value={mapping.categoryColumn ?? ''}
                onChange={(e) => update({ categoryColumn: e.target.value || null })}
              >
                <option value="">None</option>
                {headerOptions}
              </select>
            </div>
          </div>
          <label className="csv-checkbox">
            <input type="checkbox" checked={mapping.skipMoneyIn} onChange={(e) => update({ skipMoneyIn: e.target.checked })} />
            Leave out money coming in (paychecks, transfers in, refunds)
          </label>

          {preview && (
            <>
              <h3 className="csv-step">Check the preview</h3>
              <p className="csv-summary" role="status">
                <strong>{preview.ready.length} ready to import</strong>
                {preview.problems.length > 0 && ` · ${preview.problems.length} with problems`}
                {preview.skippedMoneyIn > 0 && ` · ${preview.skippedMoneyIn} money coming in left out`}
              </p>
              {preview.unmatchedCategories.length > 0 && (
                <p className="muted small">
                  These categories don't match yours, so those transactions will come in uncategorized:{' '}
                  {preview.unmatchedCategories.join(', ')}.
                </p>
              )}
              {preview.problems.length > 0 && (
                <ul className="csv-problems">
                  {preview.problems.slice(0, 5).map((p) => (
                    <li key={p.line}>
                      Line {p.line}: {p.error}
                    </li>
                  ))}
                  {preview.problems.length > 5 && <li>…and {preview.problems.length - 5} more</li>}
                </ul>
              )}
              {preview.ready.length > 0 && (
                <div className="table-scroll">
                  <table className="table">
                    <thead>
                      <tr>
                        <th scope="col">Date</th>
                        <th scope="col">Description</th>
                        <th scope="col">Category</th>
                        <th scope="col" className="amount">
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.ready.slice(0, PREVIEW_ROWS).map((row) => (
                        <tr key={row.line}>
                          <td>{formatDay(row.date)}</td>
                          <td>{row.description}</td>
                          <td>{categoryName(row.categoryId) ?? <span className="muted">Uncategorized</span>}</td>
                          <td className="amount">{formatCents(row.amountCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.ready.length > PREVIEW_ROWS && (
                    <p className="muted small">…and {preview.ready.length - PREVIEW_ROWS} more</p>
                  )}
                </div>
              )}
              <div className="csv-actions">
                <button
                  type="button"
                  className="button button-primary"
                  disabled={importing || preview.ready.length === 0}
                  onClick={runImport}
                >
                  {importing ? 'Importing…' : `Import ${preview.ready.length} transaction${preview.ready.length === 1 ? '' : 's'}`}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
