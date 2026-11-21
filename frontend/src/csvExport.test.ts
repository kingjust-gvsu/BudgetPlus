import { describe, expect, it } from 'vitest'
import type { Account, Transaction } from './api/types'
import { transactionsToCsv } from './csvExport'
import { guessMapping, previewImport, readCsv } from './csvImport'
import { makeCategory } from './test/factories'

const categories = [makeCategory({ id: 'cat-groceries', name: 'Groceries', kind: 'EXPENSE' })]
const accounts: Account[] = [
  { id: 'acct-checking', name: 'Checking', type: 'BANK', startingBalanceCents: 0, startDate: '2026-01-01', balanceCents: 0 },
  { id: 'acct-card', name: 'Amazon Card', type: 'CREDIT_CARD', startingBalanceCents: 0, startDate: '2026-01-01', balanceCents: 0 },
]

const transactions: Transaction[] = [
  { id: 'tx-1', date: '2026-10-15', description: 'Meijer', amountCents: 8412, categoryId: 'cat-groceries', accountId: 'acct-card', transferAccountId: null },
  { id: 'tx-2', date: '2026-10-08', description: 'Target refund, returned shirt', amountCents: -1800, categoryId: null, accountId: 'acct-checking', transferAccountId: null },
  { id: 'tx-3', date: '2026-10-20', description: 'Pay off card', amountCents: 8412, categoryId: null, accountId: 'acct-checking', transferAccountId: 'acct-card' },
]

describe('transactionsToCsv', () => {
  it('writes one row per transaction, oldest first, with account and category names', () => {
    expect(transactionsToCsv(transactions, categories, accounts).split('\r\n')).toEqual([
      'Date,Description,Account,Category,Amount',
      '2026-10-08,"Target refund, returned shirt",Checking,,-18.00',
      '2026-10-15,Meijer,Amazon Card,Groceries,84.12',
      '2026-10-20,Pay off card,Checking,Transfer to Amazon Card,84.12',
    ])
  })

  it('imports back into the same transactions, accounts and transfers included', () => {
    const file = readCsv(transactionsToCsv(transactions, categories, accounts))
    const mapping = guessMapping(file, accounts)

    const preview = previewImport(file, mapping, categories, accounts)

    expect(preview.problems).toEqual([])
    expect(preview.ready.map(({ line: _line, ...t }) => t)).toEqual(
      [...transactions].sort((a, b) => a.date.localeCompare(b.date)).map(({ id: _id, ...t }) => t),
    )
  })
})
