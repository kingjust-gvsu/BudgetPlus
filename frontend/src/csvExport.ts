import Papa from 'papaparse'
import type { Account, Category, Transaction } from './api/types'
import { centsToInput } from './money'
import { categoryLabel } from './transactionInput'

// Turns transactions into a CSV file that opens in a spreadsheet and imports back into Budget+.
// Amounts are positive for money spent and negative for money back, like the rest of the app.
// A transfer's category reads "Transfer to <account>", which the import understands.
export function transactionsToCsv(transactions: Transaction[], categories: Category[], accounts: Account[]): string {
  const accountNames = new Map(accounts.map((a) => [a.id, a.name]))
  const oldestFirst = [...transactions].sort((a, b) => a.date.localeCompare(b.date))
  return Papa.unparse({
    fields: ['Date', 'Description', 'Account', 'Category', 'Amount'],
    data: oldestFirst.map((t) => [
      t.date,
      t.description,
      accountNames.get(t.accountId) ?? '',
      categoryLabel(t, categories, accounts) ?? '',
      centsToInput(t.amountCents),
    ]),
  })
}
