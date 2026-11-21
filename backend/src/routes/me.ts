import { Router } from 'express'
import { currentUser } from '../auth.ts'

// /api/me: the signed-in user's own record. Income is under /api/income.
export function createMeRouter() {
  const router = Router()

  // GET /api/me: the signed-in user's record
  router.get('/', (_req, res) => {
    res.json(currentUser(res))
  })

  return router
}
