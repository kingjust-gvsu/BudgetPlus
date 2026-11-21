import { Router } from 'express'
import { currentUser } from '../auth.ts'
import { incomeForMonth, type IncomeStore } from '../income.ts'
import { buildMonthSummary, type SummaryStore } from '../summary.ts'
import { requireMonth } from '../validation.ts'

// /api/summary: one month's budget, bill, and expense status for the dashboard.
export function createSummaryRouter(store: SummaryStore, income: IncomeStore) {
  const router = Router()

  // GET /api/summary?month=2026-11
  router.get('/', async (req, res) => {
    const month = requireMonth(req.query.month, 'month')
    const userId = currentUser(res).id
    const [data, incomeData] = await Promise.all([store.load(userId, month), income.load(userId)])
    res.json(buildMonthSummary(month, incomeForMonth(incomeData, month).totalCents, data))
  })

  return router
}
