import { useMemo, useState } from 'react'
import { ApiError, apiSend } from '../api/client'
import { useAuth } from '../auth/useAuth'
import { guessMapping, previewImport, type ColumnMapping, type CsvFile, type ImportRow } from '../csvImport'
import { formatDay } from '../dates'
import { categoryLabel, formatAmount, type Names } from '../transactionInput'
import './CsvImport.css'

type Props = {
  fileName: string
  file: CsvFile // the file the user picked, already read
  // The user's categories, accounts, and income sources, to match names in the file against
  names: Names
  // Called after a successful import with a message to show
  onImported: (message: string) => void
  onCancel: () => void
}

type ImportResult = { imported: number; duplicates: number }

const PREVIEW_ROWS = 8

// An import row with its optional fields filled in, for showing like a saved transaction
const previewKind = (row: ImportRow) => ({
  ...row,
  accountId: row.accountId ?? '',
  transferAccountId: row.transferAccountId ?? null,
  incomeSourceId: row.incomeSourceId ?? null,
  isOtherIncome: row.isOtherIncome ?? false,
})

// Import transactions from a CSV file the user picked: say which column is which, check the
// preview, then import.
export function CsvImport({ fileName, file, names, onImported, onCancel }: Props) {
  // A file is imported into an open account
  const accounts = names.accounts.filter((a) => !a.closed)
  const { getToken } = useAuth()
  const [mapping, setMapping] = useState<ColumnMapping>(() => guessMapping(file, accounts))
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  const preview = useMemo(() => previewImport(file, mapping, names), [file, mapping, names])
  const showAccount = accounts.length > 1
  const accountName = (id: string | undefined) => accounts.find((a) => a.id === id)?.name
  // The Account picker's value: an account id, or "column:<header>"
  const accountChoice = mapping.accountColumn ? `column:${mapping.accountColumn}` : mapping.accountId
  const chooseAccount = (value: string) =>
    value.startsWith('column:')
      ? update({ accountColumn: value.slice('column:'.length) })
      : update({ accountColumn: null, accountId: value })

  const update = (changes: Partial<ColumnMapping>) => setMapping({ ...mapping, ...changes })

  const runImport = async () => {
    if (preview.ready.length === 0) return
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

  const headerOptions = file.headers.map((h) => (
    <option key={h} value={h}>
      {h}
    </option>
  ))

  return (
    <section className="card csv-import" aria-labelledby="csv-import-heading">
      <div className="csv-import-top">
        <h2 id="csv-import-heading">Import {fileName}</h2>
        <button type="button" className="link-button" onClick={onCancel}>
          Cancel
        </button>
      </div>

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
          <label htmlFor="csv-amount">Amount</label>
          <select id="csv-amount" value={mapping.amountColumn} onChange={(e) => update({ amountColumn: e.target.value })}>
            {headerOptions}
          </select>
        </div>
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
        {showAccount && (
          <div className="field">
            <label htmlFor="csv-account">Account</label>
            <select id="csv-account" value={accountChoice} onChange={(e) => chooseAccount(e.target.value)}>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
              <optgroup label="From a column">
                {file.headers.map((h) => (
                  <option key={h} value={`column:${h}`}>
                    {h}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
        )}
      </div>
      <label className="csv-checkbox">
        <input type="checkbox" checked={mapping.invertAmounts} onChange={(e) => update({ invertAmounts: e.target.checked })} />
        Invert amounts (if money spent shows as negative)
      </label>

      <h3 className="csv-step">Check the preview</h3>
      <p className="csv-summary" role="status">
        <strong>{preview.ready.length} ready to import</strong>
        {preview.problems.length > 0 && ` · ${preview.problems.length} with problems`}
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
                {showAccount && <th scope="col">Account</th>}
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
                  {showAccount && <td>{accountName(row.accountId)}</td>}
                  <td>
                    {categoryLabel(previewKind(row), names) ?? (
                      <span className="muted">Uncategorized</span>
                    )}
                  </td>
                  <td className="amount">{formatAmount(previewKind(row))}</td>
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

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
