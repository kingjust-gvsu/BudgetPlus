import { Router } from 'express'
import { currentUser } from '../auth.ts'
import { ValidationError } from '../errors.ts'
import type { UserStore } from '../users.ts'
import { nullable, requireBudgetCents, requireObject } from '../validation.ts'

// /api/me: the signed-in user's own record and settings.
export function createMeRouter(users: UserStore) {
  const router = Router()

  // GET /api/me: the signed-in user's record
  router.get('/', (_req, res) => {
    res.json(currentUser(res))
  })

  // PATCH /api/me { monthlyIncomeCents }: set (or clear, with null) the estimated monthly income
  router.patch('/', async (req, res) => {
    const body = requireObject(req.body)
    if (body.monthlyIncomeCents === undefined) {
      throw new ValidationError('Nothing to change: send monthlyIncomeCents')
    }
    const income = nullable(body.monthlyIncomeCents, (v) => requireBudgetCents(v, 'Monthly income'))
    res.json(await users.setMonthlyIncome(currentUser(res).id, income))
  })

  return router
}
