import { Router } from 'express'
import { currentUser } from '../auth.ts'
import {
  BUDGET_TYPES,
  CATEGORY_KINDS,
  type BudgetSettings,
  type CategoryChanges,
  type CategoryStore,
} from '../categories.ts'
import { NotFoundError, ValidationError } from '../errors.ts'
import {
  nullable,
  optionalMonth,
  requireBudgetCents,
  requireDate,
  requireFrequencyMonths,
  requireIdParam,
  requireObject,
  requireOneOf,
  requirePercent,
  requireText,
} from '../validation.ts'

const MAX_NAME_LENGTH = 100

// The budget settings in a request body; fields left out aren't changed
function readBudgetSettings(body: Record<string, unknown>): Partial<BudgetSettings> {
  const settings: Partial<BudgetSettings> = {}
  if (body.budgetType !== undefined) settings.budgetType = requireOneOf(body.budgetType, 'Budget type', BUDGET_TYPES)
  if (body.budgetCents !== undefined) {
    settings.budgetCents = nullable(body.budgetCents, (v) => requireBudgetCents(v, 'Budget amount'))
  }
  if (body.budgetPercent !== undefined) {
    settings.budgetPercent = nullable(body.budgetPercent, (v) => requirePercent(v, 'Budget percent'))
  }
  if (body.frequencyMonths !== undefined) {
    settings.frequencyMonths = requireFrequencyMonths(body.frequencyMonths, 'Frequency')
  }
  if (body.nextDueDate !== undefined) {
    settings.nextDueDate = nullable(body.nextDueDate, (v) => requireDate(v, 'Next due date'))
  }
  return settings
}

// /api/categories: the signed-in user's bill and expense categories, with their budget settings.
// Budgets can change from a month on, so past months keep theirs. Each request is for a month
// (`month`, YYYY-MM), which is this month when left out: changes start in it.
export function createCategoriesRouter(store: CategoryStore) {
  const router = Router()

  // GET /api/categories?month=2026-11: the categories in use that month, sorted by name.
  // GET /api/categories?month=all: every category the user has had, with its latest budget.
  router.get('/', async (req, res) => {
    const userId = currentUser(res).id
    if (req.query.month === 'all') return void res.json(await store.list(userId))
    res.json(await store.list(userId, optionalMonth(req.query.month, 'month')))
  })

  // POST /api/categories { name, kind, ...budget settings, month? }: add a category from `month` on
  router.post('/', async (req, res) => {
    const body = requireObject(req.body)
    const category = await store.create(
      currentUser(res).id,
      {
        name: requireText(body.name, 'Name', MAX_NAME_LENGTH),
        kind: requireOneOf(body.kind, 'Kind', CATEGORY_KINDS),
        ...readBudgetSettings(body),
      },
      optionalMonth(body.month, 'month'),
    )
    res.status(201).json(category)
  })

  // PATCH /api/categories/:id { any of the above, month? }: change a category. A budget change
  // applies from `month` on; a new name, kind, or bill schedule applies to every month.
  router.patch('/:id', async (req, res) => {
    const id = requireIdParam(req.params.id)
    const body = requireObject(req.body)
    const changes: CategoryChanges = readBudgetSettings(body)
    if (body.name !== undefined) changes.name = requireText(body.name, 'Name', MAX_NAME_LENGTH)
    if (body.kind !== undefined) changes.kind = requireOneOf(body.kind, 'Kind', CATEGORY_KINDS)
    if (Object.keys(changes).length === 0) {
      throw new ValidationError('Nothing to change')
    }

    const category = await store.update(currentUser(res).id, id, changes, optionalMonth(body.month, 'month'))
    if (!category) throw new NotFoundError('Category not found')
    res.json(category)
  })

  // DELETE /api/categories/:id?month=2026-11: remove a category from `month` on; earlier months
  // keep it and its transactions
  router.delete('/:id', async (req, res) => {
    const id = requireIdParam(req.params.id)
    const deleted = await store.delete(currentUser(res).id, id, optionalMonth(req.query.month, 'month'))
    if (!deleted) throw new NotFoundError('Category not found')
    res.status(204).end()
  })

  return router
}
