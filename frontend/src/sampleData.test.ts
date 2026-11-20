import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { guessMapping, previewImport, readCsv } from './csvImport'
import { makeCategory } from './test/factories'

// Checks that every file in sample-data/ imports the way its README says, using the same
// column guessing and preview the import screen uses.

// Tests run from the frontend folder; sample-data/ sits beside it
const sample = (name: string) => readCsv(readFileSync(resolve(process.cwd(), '../sample-data', name), 'utf-8'))

// The categories the README asks you to create
const categories = [
  'Rent',
  'Electric',
  'Internet',
  'Phone',
  'Car insurance',
  'Groceries',
  'Gas',
  'Eating out',
  'Household',
  'Entertainment',
  'Savings',
].map((name, i) => makeCategory({ id: `c${i}`, name, kind: 'EXPENSE' }))

function importOf(name: string) {
  const file = sample(name)
  const mapping = guessMapping(file)
  return { mapping, preview: previewImport(file, mapping, categories) }
}

describe('sample data', () => {
  it('budget-plus-3-months.csv imports cleanly into the README categories', () => {
    const { mapping, preview } = importOf('budget-plus-3-months.csv')

    expect(mapping.invertAmounts).toBe(false)
    expect(preview.problems).toEqual([])
    expect(preview.unmatchedCategories).toEqual([])
    expect(preview.ready).toHaveLength(72)
    expect(preview.ready.some((r) => r.categoryId === null)).toBe(true) // some coffee is uncategorized
    expect(preview.ready.some((r) => r.amountCents < 0)).toBe(true) // and there's a refund
  })

  it('checking-account-style.csv is read as negative spending', () => {
    const { mapping, preview } = importOf('checking-account-style.csv')

    expect(mapping).toMatchObject({ dateColumn: 'Posting Date', amountColumn: 'Amount', invertAmounts: true })
    expect(preview.problems).toEqual([])
    expect(preview.ready).toHaveLength(27)
  })

  it('messy-rows.csv reads every odd format and reports the five bad rows', () => {
    const { preview } = importOf('messy-rows.csv')

    // Spending is negative in this file, so "(18.00)" (accounting-style negative) is $18 spent
    expect(preview.ready.map((r) => r.amountCents)).toEqual([1200, 850, 2000, 1525, 3275, 1800, 105000, -4500])
    expect(preview.problems.map((p) => p.line)).toEqual([10, 11, 12, 13, 14])
  })

  it('5000-transactions.csv has 5,000 importable rows', () => {
    const { preview } = importOf('5000-transactions.csv')

    expect(preview.ready).toHaveLength(5000)
    expect(preview.problems).toEqual([])
  })
})
