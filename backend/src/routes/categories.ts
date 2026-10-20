import { Router } from 'express'
import { currentUser } from '../auth.ts'
import { CATEGORY_KINDS, type CategoryChanges, type CategoryStore } from '../categories.ts'
import { NotFoundError, ValidationError } from '../errors.ts'
import { requireIdParam, requireObject, requireOneOf, requireText } from '../validation.ts'

const MAX_NAME_LENGTH = 100

// /api/categories: the signed-in user's bill and expense categories.
export function createCategoriesRouter(store: CategoryStore) {
  const router = Router()

  // GET /api/categories: all of the user's categories, sorted by name
  router.get('/', async (_req, res) => {
    res.json(await store.list(currentUser(res).id))
  })

  // POST /api/categories { name, kind }: create a category
  router.post('/', async (req, res) => {
    const body = requireObject(req.body)
    const category = await store.create(currentUser(res).id, {
      name: requireText(body.name, 'Name', MAX_NAME_LENGTH),
      kind: requireOneOf(body.kind, 'Kind', CATEGORY_KINDS),
    })
    res.status(201).json(category)
  })

  // PATCH /api/categories/:id { name?, kind? }: rename a category or change its kind
  router.patch('/:id', async (req, res) => {
    const id = requireIdParam(req.params.id)
    const body = requireObject(req.body)
    const changes: CategoryChanges = {}
    if (body.name !== undefined) changes.name = requireText(body.name, 'Name', MAX_NAME_LENGTH)
    if (body.kind !== undefined) changes.kind = requireOneOf(body.kind, 'Kind', CATEGORY_KINDS)
    if (Object.keys(changes).length === 0) {
      throw new ValidationError('Nothing to change: send a name or a kind')
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
