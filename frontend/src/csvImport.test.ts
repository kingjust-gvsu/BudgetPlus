import { describe, expect, it } from 'vitest'
import { guessMapping, parseDate, parseMoney, previewImport, readCsv, type ColumnMapping } from './csvImport'
import { makeCategory } from './test/factories'

const categories = [
  makeCategory({ id: 'groceries', name: 'Groceries', kind: 'EXPENSE' }),
  makeCategory({ id: 'gas', name: 'Gas', kind: 'EXPENSE' }),
]

describe('parseDate', () => {
  it.each([
    ['2026-10-15', '2026-10-15'],
    ['10/15/2026', '2026-10-15'],
    ['1/5/2026', '2026-01-05'],
    ['10-15-2026', '2026-10-15'],
    ['10/15/26', '2026-10-15'],
  ])('reads %s', (text, date) => {
    expect(parseDate(text)).toBe(date)
  })

  it.each(['', 'Oct 15', '2/30/2026', '13/01/2026', '2026/10/15'])('rejects %j', (text) => {
    expect(parseDate(text)).toBeNull()
  })
})

describe('parseMoney', () => {
  it.each([
    ['45.00', 4500],
    ['-45.00', -4500],
    ['$1,234.56', 123456],
    ['+12', 1200],
    ['(18.00)', -1800],
    ['$-5.25', -525],
  ])('reads %s', (text, cents) => {
    expect(parseMoney(text)).toBe(cents)
  })

  it.each(['', 'abc', '1.234'])('rejects %j', (text) => {
    expect(parseMoney(text)).toBeNull()
  })
})

describe('guessMapping', () => {
  it('finds the columns of a bank file and sees spending is negative', () => {
    const file = readCsv('Posting Date,Description,Amount,Balance\n10/15/2026,MEIJER,-84.12,900\n10/16/2026,PAYROLL,2000.00,2900\n10/17/2026,SHELL,-48.30,2851')

    expect(guessMapping(file)).toEqual({
      dateColumn: 'Posting Date',
      descriptionColumn: 'Description',
      amountColumn: 'Amount',
      categoryColumn: null,
      invertAmounts: true,
    })
  })

  it('finds a category column', () => {
    const file = readCsv('Date,Description,Amount,Category\n2026-10-15,Meijer,84.12,Groceries')

    expect(guessMapping(file)).toMatchObject({ categoryColumn: 'Category', invertAmounts: false })
  })
})

describe('previewImport', () => {
  const singleNegative: ColumnMapping = {
    dateColumn: 'Date',
    descriptionColumn: 'Description',
    amountColumn: 'Amount',
    categoryColumn: 'Category',
    invertAmounts: true,
  }

  it('turns rows into transactions, matching categories by name', () => {
    const file = readCsv('Date,Description,Amount,Category\n10/15/2026,Meijer,-84.12,groceries\n10/16/2026,Shell,-48.30,Fuel')

    const preview = previewImport(file, singleNegative, categories)

    expect(preview.ready).toEqual([
      { line: 2, date: '2026-10-15', description: 'Meijer', amountCents: 8412, categoryId: 'groceries' },
      { line: 3, date: '2026-10-16', description: 'Shell', amountCents: 4830, categoryId: null },
    ])
    expect(preview.unmatchedCategories).toEqual(['Fuel'])
  })

  it('flips amounts only when asked to', () => {
    const file = readCsv('Date,Description,Amount,Category\n10/15/2026,Meijer,-84.12,\n10/17/2026,Refund,18.00,')

    expect(previewImport(file, singleNegative, categories).ready.map((r) => r.amountCents)).toEqual([8412, -1800])
    const asIs = previewImport(file, { ...singleNegative, invertAmounts: false }, categories)
    expect(asIs.ready.map((r) => r.amountCents)).toEqual([-8412, 1800])
  })

  it('reports rows it cannot use, with their line numbers', () => {
    const file = readCsv('Date,Description,Amount,Category\nsoon,Meijer,-84.12,\n10/16/2026,,-5.00,\n10/17/2026,Shell,lots,\n10/18/2026,Zero,0.00,')

    expect(previewImport(file, singleNegative, categories).problems).toEqual([
      { line: 2, error: 'Can\'t read the date "soon"' },
      { line: 3, error: 'No description' },
      { line: 4, error: "Can't read the amount" },
      { line: 5, error: 'The amount is zero' },
    ])
  })

  it('handles quoted fields with commas', () => {
    const file = readCsv('Date,Description,Amount\n10/15/2026,"Joe\'s Pizza, Downtown","-32.75"')
    const mapping = { ...singleNegative, categoryColumn: null }

    expect(previewImport(file, mapping, categories).ready[0]).toMatchObject({ description: "Joe's Pizza, Downtown", amountCents: 3275 })
  })
})
