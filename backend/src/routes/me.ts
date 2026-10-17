import { Router } from 'express'
import { currentUser } from '../auth.ts'

// GET /api/me: returns the signed-in user's record.
export const meRouter = Router()

meRouter.get('/', (_req, res) => {
  res.json(currentUser(res))
})
