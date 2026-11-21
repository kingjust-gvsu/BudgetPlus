import Papa from 'papaparse'
import type { TransactionInput } from './api/types'
import { parseDollars } from './money'
import type { Names } from './transactionInput'

// Turns a CSV file (a bank's export, or Budget+'s own) into transactions. Files are laid out
// differently, so the user says which column is which (we guess first).

export type CsvFile = {
  headers: string[]
  rows: Record<string, string>[]
}

export type ColumnMapping = {
  dateColumn: string
  descriptionColumn: string
  amountColumn: string
  categoryColumn: string | null // optional: matched to the user's categories by name
  // Which account the transactions are in: one account for the whole file (a bank's export), or
  // a column naming each row's account (Budget+'s own export). '' = the user's main account.
  accountId: string
  accountColumn: string | null
  // Budget+ counts money spent as positive. Many banks show it as negative, so flip every amount.
  invertAmounts: boolean
}

export type ImportRow = TransactionInput & { line: number } // line = line number in the file

export type ImportPreview = {
  ready: ImportRow[]
  problems: { line: number; error: string }[]
  // Category names in the file that don't match any of the user's categories
  unmatchedCategories: string[]
}

// A category like "Transfer to Amazon Card" is a transfer to that account (Budget+'s export
// writes transfers this way)
const TRANSFER_TO = /^transfer to (.+)$/i
// "Income: VR" is money in from that income source, and "Other income" is other income
const INCOME_FROM = /^income: *(.+)$/i
const OTHER_INCOME = /^other income$/i

export function readCsv(text: string): CsvFile {
  const result = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim(),
  })
  return { headers: (result.meta.fields ?? []).filter((h) => h !== ''), rows: result.data }
}

const pad = (n: number) => String(n).padStart(2, '0')

// Common bank date formats → YYYY-MM-DD, or null if it can't be read or isn't a real date.
// Slashed and dashed dates are read month first (US banks): 10/15/2026, 10-15-2026, 10/15/26.
export function parseDate(text: string): string | null {
  const value = text.trim()
  let year: number, month: number, day: number
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value)
  if (match) {
    ;[year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  } else if ((match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(value))) {
    ;[month, day, year] = [Number(match[1]), Number(match[2]), Number(match[3])]
    if (year < 100) year += 2000
  } else {
    return null
  }
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${year}-${pad(month)}-${pad(day)}`
}

// A money amount as banks write it → cents: "$1,234.56", "-45.00", "+12", "(18.00)" (negative)
export function parseMoney(text: string): number | null {
  let value = text.trim()
  if (value === '') return null
  const parenthesized = /^\((.*)\)$/.exec(value)
  if (parenthesized) value = `-${parenthesized[1]}`
  value = value.replace(/^\+/, '').replace(/^\$-/, '-$')
  return parseDollars(value)
}

// Guess which column is which from the header names
export function guessMapping(file: CsvFile, accounts: { id: string }[] = []): ColumnMapping {
  const find = (...patterns: RegExp[]) => {
    for (const pattern of patterns) {
      const header = file.headers.find((h) => pattern.test(h))
      if (header) return header
    }
    return null
  }
  const dateColumn = find(/^(posting|transaction|trans\.?|post)?\s*date$/i, /date/i) ?? file.headers[0] ?? ''
  const descriptionColumn = find(/desc/i, /memo/i, /payee/i, /merchant/i, /name/i, /details/i) ?? file.headers[1] ?? ''
  const amountColumn = find(/^amount$/i, /amount/i) ?? file.headers[2] ?? ''
  const categoryColumn = find(/category/i)
  const accountColumn = find(/^account$/i)
  // If most amounts are negative, money spent is probably shown as negative (like most banks)
  const values = file.rows.map((r) => parseMoney(r[amountColumn] ?? '')).filter((v): v is number => v !== null && v !== 0)
  const invertAmounts = values.filter((v) => v < 0).length > values.length / 2
  return { dateColumn, descriptionColumn, amountColumn, categoryColumn, accountId: accounts[0]?.id ?? '', accountColumn, invertAmounts }
}

export function previewImport(file: CsvFile, mapping: ColumnMapping, names: Partial<Names>): ImportPreview {
  const lookup = (items: { id: string; name: string }[] = []) => new Map(items.map((i) => [i.name.trim().toLowerCase(), i.id]))
  const byName = lookup(names.categories)
  const accountByName = lookup(names.accounts)
  const sourceByName = lookup(names.incomeSources)
  const preview: ImportPreview = { ready: [], problems: [], unmatchedCategories: [] }
  const unmatched = new Set<string>()

  file.rows.forEach((row, index) => {
    const line = index + 2 // the header is line 1
    const date = parseDate(row[mapping.dateColumn] ?? '')
    const description = (row[mapping.descriptionColumn] ?? '').trim()
    const amount = parseMoney(row[mapping.amountColumn] ?? '')
    const amountCents = amount !== null && mapping.invertAmounts ? -amount : amount

    if (date === null) return preview.problems.push({ line, error: `Can't read the date "${row[mapping.dateColumn] ?? ''}"` })
    if (!description) return preview.problems.push({ line, error: 'No description' })
    if (amountCents === null) return preview.problems.push({ line, error: "Can't read the amount" })
    if (amountCents === 0) return preview.problems.push({ line, error: 'The amount is zero' })

    let accountId = mapping.accountId
    if (mapping.accountColumn) {
      const accountName = (row[mapping.accountColumn] ?? '').trim()
      accountId = accountByName.get(accountName.toLowerCase()) ?? ''
      if (!accountId) return preview.problems.push({ line, error: `You don't have an account named "${accountName}"` })
    }

    let categoryId: string | null = null
    let transferAccountId: string | null = null
    let incomeSourceId: string | null = null
    let isOtherIncome = false
    const categoryName = mapping.categoryColumn ? (row[mapping.categoryColumn] ?? '').trim() : ''
    const transferTo = TRANSFER_TO.exec(categoryName)?.[1].trim().toLowerCase()
    const incomeFrom = INCOME_FROM.exec(categoryName)?.[1].trim().toLowerCase()
    if (OTHER_INCOME.test(categoryName)) {
      isOtherIncome = true
    } else if (incomeFrom && sourceByName.has(incomeFrom)) {
      incomeSourceId = sourceByName.get(incomeFrom)!
    } else if (transferTo && accountByName.has(transferTo)) {
      transferAccountId = accountByName.get(transferTo)!
      if (transferAccountId === accountId) return preview.problems.push({ line, error: 'A transfer has to go to a different account' })
    } else if (categoryName) {
      categoryId = byName.get(categoryName.toLowerCase()) ?? null
      if (!categoryId) unmatched.add(categoryName)
    }
    preview.ready.push({
      line,
      date,
      description: description.slice(0, 200),
      amountCents,
      categoryId,
      transferAccountId,
      incomeSourceId,
      isOtherIncome,
      ...(accountId && { accountId }),
    })
  })

  preview.unmatchedCategories = [...unmatched].sort()
  return preview
}
