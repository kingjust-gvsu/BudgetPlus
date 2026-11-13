import { Router } from 'express'
import { currentUser } from '../auth.ts'
import { NotFoundError, ValidationError } from '../errors.ts'
import { CATEGORY_NOT_FOUND, type TransactionChanges, type TransactionInput, type TransactionStore } from '../transactions.ts'
import {
  isUuid,
  requireCents,
  requireDate,
  requireIdParam,
  requireMonth,
  requireObject,
  requireText,
} from '../validation.ts'

const MAX_DESCRIPTION_LENGTH = 200
const MAX_IMPORT_ROWS = 5000

// A category is optional: null (or left out) means uncategorized
function optionalCategoryId(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (!isUuid(value)) throw new ValidationError(CATEGORY_NOT_FOUND)
  return value
}

// /api/transactions: money the signed-in user actually spent or got back.
export function createTransactionsRouter(store: TransactionStore) {
  const router = Router()

  // GET /api/transactions?month=2026-10: the month's transactions, newest first
  router.get('/', async (req, res) => {
    const month = requireMonth(req.query.month, 'month')
    res.json(await store.listByMonth(currentUser(res).id, month))
  })

  // POST /api/transactions { date, description, amountCents, categoryId? }: add a transaction
  router.post('/', async (req, res) => {
    const body = requireObject(req.body)
    const transaction = await store.create(currentUser(res).id, {
      date: requireDate(body.date, 'Date'),
      description: requireText(body.description, 'Description', MAX_DESCRIPTION_LENGTH),
      amountCents: requireCents(body.amountCents, 'Amount'),
      categoryId: optionalCategoryId(body.categoryId),
    })
    res.status(201).json(transaction)
  })

  // POST /api/transactions/import { transactions: [{ date, description, amountCents, categoryId? }] }
  // Adds many transactions at once, skipping ones the user already has. If any row has a problem,
  // nothing is added and each problem is reported with its row number (1 = the first transaction).
  router.post('/import', async (req, res) => {
    const body = requireObject(req.body)
    if (!Array.isArray(body.transactions) || body.transactions.length === 0) {
      throw new ValidationError('Send at least one transaction to import')
    }
    if (body.transactions.length > MAX_IMPORT_ROWS) {
      throw new ValidationError(`Import at most ${MAX_IMPORT_ROWS} transactions at a time`)
    }

    const inputs: TransactionInput[] = []
    const problems: { row: number; error: string }[] = []
    body.transactions.forEach((raw: unknown, index: number) => {
      try {
        const row = requireObject(raw)
        inputs.push({
          date: requireDate(row.date, 'Date'),
          description: requireText(row.description, 'Description', MAX_DESCRIPTION_LENGTH),
          amountCents: requireCents(row.amountCents, 'Amount'),
          categoryId: optionalCategoryId(row.categoryId),
        })
      } catch (error) {
        if (!(error instanceof ValidationError)) throw error
        problems.push({ row: index + 1, error: error.message })
      }
    })
    if (problems.length > 0) {
      res.status(400).json({ error: `${problems.length} row(s) have problems`, problems })
      return
    }

    res.status(201).json(await store.importMany(currentUser(res).id, inputs))
  })

  // PATCH /api/transactions/:id { any of the above }: change a transaction
  router.patch('/:id', async (req, res) => {
    const id = requireIdParam(req.params.id)
    const body = requireObject(req.body)
    const changes: TransactionChanges = {}
    if (body.date !== undefined) changes.date = requireDate(body.date, 'Date')
    if (body.description !== undefined) {
      changes.description = requireText(body.description, 'Description', MAX_DESCRIPTION_LENGTH)
    }
    if (body.amountCents !== undefined) changes.amountCents = requireCents(body.amountCents, 'Amount')
    if (body.categoryId !== undefined) changes.categoryId = optionalCategoryId(body.categoryId)
    if (Object.keys(changes).length === 0) {
      throw new ValidationError('Nothing to change: send a date, description, amount, or category')
    }

    const transaction = await store.update(currentUser(res).id, id, changes)
    if (!transaction) throw new NotFoundError('Transaction not found')
    res.json(transaction)
  })

  // DELETE /api/transactions/:id: delete a transaction
  router.delete('/:id', async (req, res) => {
    const id = requireIdParam(req.params.id)
    const deleted = await store.delete(currentUser(res).id, id)
    if (!deleted) throw new NotFoundError('Transaction not found')
    res.status(204).end()
  })

  return router
}
