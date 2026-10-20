import cors from 'cors'
import express, { type ErrorRequestHandler } from 'express'
import { requireAuth, type FindOrCreateUser, type VerifyToken } from './auth.ts'
import type { CategoryStore } from './categories.ts'
import type { Config } from './config.ts'
import { ConflictError, NotFoundError, ValidationError } from './errors.ts'
import { createCategoriesRouter } from './routes/categories.ts'
import { createHealthRouter, type DatabaseCheck } from './routes/health.ts'
import { meRouter } from './routes/me.ts'
import { createTransactionsRouter } from './routes/transactions.ts'
import type { TransactionStore } from './transactions.ts'

export type AppDependencies = {
  checkDatabase: DatabaseCheck
  verifyToken: VerifyToken
  findOrCreateUser: FindOrCreateUser
  categories: CategoryStore
  transactions: TransactionStore
}

// Builds the Express app without starting a server, so tests can call it directly
// and swap in fake dependencies instead of a real database or Firebase.
export function createApp(config: Pick<Config, 'corsOrigin'>, deps: AppDependencies) {
  const app = express()

  app.use(cors({ origin: config.corsOrigin }))
  app.use(express.json())

  // Public routes
  app.use('/api/health', createHealthRouter(deps.checkDatabase))

  // Routes below require a signed-in user
  const signedIn = requireAuth(deps.verifyToken, deps.findOrCreateUser)
  app.use('/api/me', signedIn, meRouter)
  app.use('/api/categories', signedIn, createCategoriesRouter(deps.categories))
  app.use('/api/transactions', signedIn, createTransactionsRouter(deps.transactions))

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof ValidationError) {
      res.status(400).json({ error: err.message })
    } else if (err instanceof NotFoundError) {
      res.status(404).json({ error: err.message })
    } else if (err instanceof ConflictError) {
      res.status(409).json({ error: err.message })
    } else if (err?.type === 'entity.parse.failed') {
      // express.json() couldn't read the body
      res.status(400).json({ error: 'Request body must be valid JSON' })
    } else {
      console.error(err)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
  app.use(errorHandler)

  return app
}
