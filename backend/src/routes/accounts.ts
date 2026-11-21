import { Router } from 'express'
import { ACCOUNT_NOT_FOUND, ACCOUNT_TYPES, type AccountChanges, type AccountStore } from '../accounts.ts'
import { currentUser } from '../auth.ts'
import { NotFoundError, ValidationError } from '../errors.ts'
import { requireBalanceCents, requireDate, requireIdParam, requireObject, requireOneOf, requireText } from '../validation.ts'

const MAX_NAME_LENGTH = 100

// /api/accounts: where the signed-in user keeps money (bank accounts, credit cards, savings funds),
// each with its balance.
export function createAccountsRouter(store: AccountStore) {
  const router = Router()

  // GET /api/accounts: every account with its balance
  router.get('/', async (_req, res) => {
    res.json(await store.list(currentUser(res).id))
  })

  // POST /api/accounts { name, type, startingBalanceCents, startDate }: add an account
  router.post('/', async (req, res) => {
    const body = requireObject(req.body)
    const account = await store.create(currentUser(res).id, {
      name: requireText(body.name, 'Name', MAX_NAME_LENGTH),
      type: requireOneOf(body.type, 'Type', ACCOUNT_TYPES),
      startingBalanceCents: requireBalanceCents(body.startingBalanceCents, 'Starting balance'),
      startDate: requireDate(body.startDate, 'Start date'),
    })
    res.status(201).json(account)
  })

  // PATCH /api/accounts/:id { any of the above }: change an account
  router.patch('/:id', async (req, res) => {
    const id = requireIdParam(req.params.id)
    const body = requireObject(req.body)
    const changes: AccountChanges = {}
    if (body.name !== undefined) changes.name = requireText(body.name, 'Name', MAX_NAME_LENGTH)
    if (body.type !== undefined) changes.type = requireOneOf(body.type, 'Type', ACCOUNT_TYPES)
    if (body.startingBalanceCents !== undefined) {
      changes.startingBalanceCents = requireBalanceCents(body.startingBalanceCents, 'Starting balance')
    }
    if (body.startDate !== undefined) changes.startDate = requireDate(body.startDate, 'Start date')
    if (Object.keys(changes).length === 0) {
      throw new ValidationError('Nothing to change: send a name, type, starting balance, or start date')
    }
    const account = await store.update(currentUser(res).id, id, changes)
    if (!account) throw new NotFoundError(ACCOUNT_NOT_FOUND)
    res.json(account)
  })

  // DELETE /api/accounts/:id: delete an account that has no transactions
  router.delete('/:id', async (req, res) => {
    const id = requireIdParam(req.params.id)
    if (!(await store.delete(currentUser(res).id, id))) throw new NotFoundError(ACCOUNT_NOT_FOUND)
    res.status(204).end()
  })

  return router
}
