import cors from 'cors'
import express, { type ErrorRequestHandler } from 'express'
import type { AccountStore } from './accounts.ts'
import { requireAuth, type FindOrCreateUser, type VerifyToken } from './auth.ts'
import type { BackupStore } from './backup.ts'
import type { CategoryStore } from './categories.ts'
import type { Config } from './config.ts'
import type { IncomeStore } from './income.ts'
import { ConflictError, NotFoundError, ValidationError } from './errors.ts'
import { createAccountsRouter } from './routes/accounts.ts'
import { createBackupRouter } from './routes/backup.ts'
import { createCategoriesRouter } from './routes/categories.ts'
import { createHealthRouter, type DatabaseCheck } from './routes/health.ts'
import { createIncomeRouter } from './routes/income.ts'
import { createMeRouter } from './routes/me.ts'
import { createSpendingRouter } from './routes/spending.ts'
import { createSummaryRouter } from './routes/summary.ts'
import { createTransactionsRouter } from './routes/transactions.ts'
import type { SummaryStore } from './summary.ts'
import type { TransactionStore } from './transactions.ts'

export type AppDependencies = {
  checkDatabase: DatabaseCheck
  verifyToken: VerifyToken
  findOrCreateUser: FindOrCreateUser
  categories: CategoryStore
  transactions: TransactionStore
  income: IncomeStore
  accounts: AccountStore
  summary: SummaryStore
  backup: BackupStore
}

// Builds the Express app without starting a server, so tests can call it directly
// and swap in fake dependencies instead of a real database or Firebase.
export function createApp(config: Pick<Config, 'corsOrigin'>, deps: AppDependencies) {
  const app = express()

  app.use(cors({ origin: config.corsOrigin }))
  // Big enough for a bank CSV import of a few thousand transactions
  app.use(express.json({ limit: '2mb' }))

  // Public routes
  app.use('/api/health', createHealthRouter(deps.checkDatabase))

  // Routes below require a signed-in user
  const signedIn = requireAuth(deps.verifyToken, deps.findOrCreateUser)
  app.use('/api/me', signedIn, createMeRouter())
  app.use('/api/income', signedIn, createIncomeRouter(deps.income))
  app.use('/api/accounts', signedIn, createAccountsRouter(deps.accounts))
  app.use('/api/categories', signedIn, createCategoriesRouter(deps.categories))
  app.use('/api/transactions', signedIn, createTransactionsRouter(deps.transactions))
  app.use('/api/summary', signedIn, createSummaryRouter(deps.summary, deps.income))
  app.use('/api/spending', signedIn, createSpendingRouter(deps.categories, deps.transactions, deps.income))
  app.use('/api/backup', signedIn, createBackupRouter(deps.backup))

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
