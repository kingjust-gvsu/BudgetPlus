import { Router } from 'express'
import { currentUser } from '../auth.ts'
import type { CategoryStore } from '../categories.ts'
import { ValidationError } from '../errors.ts'
import { monthsBetween } from '../fund.ts'
import { monthsEnding, spendingSummary } from '../spending.ts'
import type { TransactionStore } from '../transactions.ts'
import { requireMonth } from '../validation.ts'

const MAX_MONTHS = 24

// /api/spending: how much was spent over the last few months, for the spending charts.
export function createSpendingRouter(categories: CategoryStore, transactions: TransactionStore) {
  const router = Router()

  // GET /api/spending?to=2026-11&months=6: the 6 months ending with November 2026, plus the
  // user's monthly income (null if not set) to compare against.
  // months=all starts from the month of the user's first transaction.
  router.get('/', async (req, res) => {
    const to = requireMonth(req.query.to, 'to')
    const all = req.query.months === 'all'
    const requested = all ? 1 : Number(req.query.months ?? 6)
    if (!Number.isInteger(requested) || requested < 1 || requested > MAX_MONTHS) {
      throw new ValidationError(`months must be a whole number from 1 to ${MAX_MONTHS}, or all`)
    }
    const user = currentUser(res)
    const userId = user.id
    const [userCategories, userTransactions] = await Promise.all([
      categories.list(userId),
      transactions.list(userId),
    ])
    const oldest = userTransactions.reduce<string | undefined>((min, t) => (!min || t.date < min ? t.date : min), undefined)?.slice(0, 7)
    const count = all && oldest && oldest < to ? monthsBetween(oldest, to) + 1 : requested
    res.json({
      incomeCents: user.monthlyIncomeCents,
      ...spendingSummary(monthsEnding(to, count), userCategories, userTransactions),
    })
  })

  return router
}
