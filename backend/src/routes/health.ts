import { Router } from 'express'

// Returns true if the database answers, false otherwise.
export type DatabaseCheck = () => Promise<boolean>

// GET /api/health: lets the frontend (and us) check that the API and database are running.
export function createHealthRouter(checkDatabase: DatabaseCheck) {
  const router = Router()

  router.get('/', async (_req, res) => {
    const databaseOk = await checkDatabase()
    res.status(databaseOk ? 200 : 503).json({
      status: databaseOk ? 'ok' : 'degraded',
      database: databaseOk ? 'ok' : 'unavailable',
    })
  })

  return router
}
