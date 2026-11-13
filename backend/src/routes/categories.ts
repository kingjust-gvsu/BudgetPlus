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
export function createCategoriesRouter(store: CategoryStore) {
  const router = Router()

  // GET /api/categories: all of the user's categories, sorted by name
  router.get('/', async (_req, res) => {
    res.json(await store.list(currentUser(res).id))
  })

  // POST /api/categories { name, kind, ...budget settings }: create a category
  router.post('/', async (req, res) => {
    const body = requireObject(req.body)
    const category = await store.create(currentUser(res).id, {
      name: requireText(body.name, 'Name', MAX_NAME_LENGTH),
      kind: requireOneOf(body.kind, 'Kind', CATEGORY_KINDS),
      ...readBudgetSettings(body),
    })
    res.status(201).json(category)
  })

  // PATCH /api/categories/:id { any of the above }: change a category
  router.patch('/:id', async (req, res) => {
    const id = requireIdParam(req.params.id)
    const body = requireObject(req.body)
    const changes: CategoryChanges = readBudgetSettings(body)
    if (body.name !== undefined) changes.name = requireText(body.name, 'Name', MAX_NAME_LENGTH)
    if (body.kind !== undefined) changes.kind = requireOneOf(body.kind, 'Kind', CATEGORY_KINDS)
    if (Object.keys(changes).length === 0) {
      throw new ValidationError('Nothing to change')
    }

    const category = await store.update(currentUser(res).id, id, changes)
    if (!category) throw new NotFoundError('Category not found')
    res.json(category)
  })

  // DELETE /api/categories/:id: delete a category; its transactions become uncategorized
  router.delete('/:id', async (req, res) => {
    const id = requireIdParam(req.params.id)
    const deleted = await store.delete(currentUser(res).id, id)
    if (!deleted) throw new NotFoundError('Category not found')
    res.status(204).end()
  })

  return router
}
