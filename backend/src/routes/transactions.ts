import { Router } from 'express'
import { currentUser } from '../auth.ts'
import { NotFoundError, ValidationError } from '../errors.ts'
import { CATEGORY_NOT_FOUND, type TransactionChanges, type TransactionStore } from '../transactions.ts'
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
