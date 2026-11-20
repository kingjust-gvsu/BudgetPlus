import Papa from 'papaparse'
import type { Category, Transaction } from './api/types'
import { centsToInput } from './money'

// Turns transactions into a CSV file that opens in a spreadsheet and imports back into Budget+.
// Amounts are positive for money spent and negative for money back, like the rest of the app.
export function transactionsToCsv(transactions: Transaction[], categories: Category[]): string {
  const names = new Map(categories.map((c) => [c.id, c.name]))
  const oldestFirst = [...transactions].sort((a, b) => a.date.localeCompare(b.date))
  return Papa.unparse({
    fields: ['Date', 'Description', 'Category', 'Amount'],
    data: oldestFirst.map((t) => [
      t.date,
      t.description,
      (t.categoryId && names.get(t.categoryId)) ?? '',
      centsToInput(t.amountCents),
    ]),
  })
}
