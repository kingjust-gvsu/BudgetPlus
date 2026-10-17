import cors from 'cors'
import express, { type ErrorRequestHandler } from 'express'
import type { Config } from './config.ts'
import { createHealthRouter, type DatabaseCheck } from './routes/health.ts'

export type AppDependencies = {
  checkDatabase: DatabaseCheck
}

// Builds the Express app without starting a server, so tests can call it directly
// and swap in fake dependencies instead of a real database.
export function createApp(config: Pick<Config, 'corsOrigin'>, deps: AppDependencies) {
  const app = express()

  app.use(cors({ origin: config.corsOrigin }))
  app.use(express.json())

  app.use('/api/health', createHealthRouter(deps.checkDatabase))

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
  app.use(errorHandler)

  return app
}
