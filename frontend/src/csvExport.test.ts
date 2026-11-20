import { describe, expect, it } from 'vitest'
import type { Transaction } from './api/types'
import { transactionsToCsv } from './csvExport'
import { guessMapping, previewImport, readCsv } from './csvImport'
import { makeCategory } from './test/factories'

const categories = [makeCategory({ id: 'cat-groceries', name: 'Groceries', kind: 'EXPENSE' })]

const transactions: Transaction[] = [
  { id: 'tx-1', date: '2026-10-15', description: 'Meijer', amountCents: 8412, categoryId: 'cat-groceries' },
  { id: 'tx-2', date: '2026-10-08', description: 'Target refund, returned shirt', amountCents: -1800, categoryId: null },
  { id: 'tx-3', date: '2026-10-20', description: 'Coffee', amountCents: 450, categoryId: null },
]

describe('transactionsToCsv', () => {
  it('writes one row per transaction, oldest first, with category names', () => {
    expect(transactionsToCsv(transactions, categories).split('\r\n')).toEqual([
      'Date,Description,Category,Amount',
      '2026-10-08,"Target refund, returned shirt",,-18.00',
      '2026-10-15,Meijer,Groceries,84.12',
      '2026-10-20,Coffee,,4.50',
    ])
  })

  it('imports back into the same transactions', () => {
    const file = readCsv(transactionsToCsv(transactions, categories))
    const mapping = guessMapping(file)

    const preview = previewImport(file, mapping, categories)

    expect(preview.problems).toEqual([])
    expect(preview.ready.map(({ line: _line, ...t }) => t)).toEqual(
      [...transactions].sort((a, b) => a.date.localeCompare(b.date)).map(({ id: _id, ...t }) => t),
    )
  })
})
