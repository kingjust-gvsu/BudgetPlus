import { Router } from 'express'

// GET /api/health: lets the frontend (and us) check that the API is running.
export const healthRouter = Router()

healthRouter.get('/', (_req, res) => {
  res.json({ status: 'ok' })
})
