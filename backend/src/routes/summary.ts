import { Router } from 'express'
import { currentUser } from '../auth.ts'
import { buildMonthSummary, type SummaryStore } from '../summary.ts'
import { requireMonth } from '../validation.ts'

// /api/summary: one month's budget, bill, and expense status for the dashboard.
export function createSummaryRouter(store: SummaryStore) {
  const router = Router()

  // GET /api/summary?month=2026-11
  router.get('/', async (req, res) => {
    const month = requireMonth(req.query.month, 'month')
    const user = currentUser(res)
    const data = await store.load(user.id, month)
    res.json(buildMonthSummary(month, user.monthlyIncomeCents, data))
  })

  return router
}
