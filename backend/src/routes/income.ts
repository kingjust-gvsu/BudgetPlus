import { Router } from 'express'
import { currentUser } from '../auth.ts'
import { NotFoundError, ValidationError } from '../errors.ts'
import { incomeForMonth, type IncomeStore } from '../income.ts'
import { requireBudgetCents, requireIdParam, requireMonth, requireObject, requireText } from '../validation.ts'

const MAX_NAME_LENGTH = 100
const SOURCE_NOT_FOUND = 'Income source not found'

// /api/income: the signed-in user's income, month by month. Every change answers with the month's
// income (sources, other income, and total), as GET does, so the page can just show it.
export function createIncomeRouter(store: IncomeStore) {
  const router = Router()

  const monthIncome = async (userId: string, month: string) => incomeForMonth(await store.load(userId), month)

  // GET /api/income?month=2026-11
  router.get('/', async (req, res) => {
    const month = requireMonth(req.query.month, 'month')
    res.json(await monthIncome(currentUser(res).id, month))
  })

  // GET /api/income/sources: every income source the user has had, for naming deposits
  router.get('/sources', async (_req, res) => {
    const { sources } = await store.load(currentUser(res).id)
    res.json(sources.map(({ id, name }) => ({ id, name })))
  })

  // POST /api/income/sources { name, amountCents, month }: add a source, paid from `month` on.
  // Using the name of a source that isn't paying that month (stopped, or not started) restarts it.
  router.post('/sources', async (req, res) => {
    const body = requireObject(req.body)
    const month = requireMonth(body.month, 'month')
    const name = requireText(body.name, 'Name', MAX_NAME_LENGTH)
    const amountCents = requireBudgetCents(body.amountCents, 'Amount')
    const userId = currentUser(res).id
    const data = await store.load(userId)
    const existing = data.sources.find((s) => s.name === name)
    if (existing && !incomeForMonth(data, month).sources.some((s) => s.id === existing.id)) {
      await store.setAmount(userId, existing.id, month, amountCents)
    } else {
      await store.createSource(userId, name, month, amountCents)
    }
    res.status(201).json(await monthIncome(userId, month))
  })

  // PATCH /api/income/sources/:id { month, name?, amountCents? }: rename a source, or change its
  // amount from `month` on
  router.patch('/sources/:id', async (req, res) => {
    const id = requireIdParam(req.params.id)
    const body = requireObject(req.body)
    const month = requireMonth(body.month, 'month')
    if (body.name === undefined && body.amountCents === undefined) {
      throw new ValidationError('Nothing to change: send a name or amountCents')
    }
    const userId = currentUser(res).id
    if (body.name !== undefined) {
      const renamed = await store.renameSource(userId, id, requireText(body.name, 'Name', MAX_NAME_LENGTH))
      if (!renamed) throw new NotFoundError(SOURCE_NOT_FOUND)
    }
    if (body.amountCents !== undefined) {
      const changed = await store.setAmount(userId, id, month, requireBudgetCents(body.amountCents, 'Amount'))
      if (!changed) throw new NotFoundError(SOURCE_NOT_FOUND)
    }
    res.json(await monthIncome(userId, month))
  })

  // DELETE /api/income/sources/:id?month=2026-11: stop a source from that month on; earlier
  // months keep it
  router.delete('/sources/:id', async (req, res) => {
    const id = requireIdParam(req.params.id)
    const month = requireMonth(req.query.month, 'month')
    const userId = currentUser(res).id
    if (!(await store.stopSource(userId, id, month))) throw new NotFoundError(SOURCE_NOT_FOUND)
    res.json(await monthIncome(userId, month))
  })

  // PUT /api/income/other { month, amountCents }: the month's one-off income (0 clears it)
  router.put('/other', async (req, res) => {
    const body = requireObject(req.body)
    const month = requireMonth(body.month, 'month')
    const userId = currentUser(res).id
    await store.setOther(userId, month, requireBudgetCents(body.amountCents, 'Other income'))
    res.json(await monthIncome(userId, month))
  })

  return router
}
