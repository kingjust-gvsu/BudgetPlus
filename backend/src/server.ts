import { createApp } from './app.ts'
import { createFirebaseTokenVerifier } from './auth.ts'
import { createCategoryStore } from './categories.ts'
import { loadConfig } from './config.ts'
import { createDatabase } from './db.ts'
import { createSummaryStore } from './summary.ts'
import { createTransactionStore } from './transactions.ts'
import { createFindOrCreateUser, createUserStore } from './users.ts'

const config = loadConfig()
const db = createDatabase(config.databaseUrl)

const app = createApp(config, {
  checkDatabase: async () => {
    try {
      await db.$queryRaw`SELECT 1`
      return true
    } catch {
      return false
    }
  },
  verifyToken: createFirebaseTokenVerifier(config.firebaseProjectId),
  findOrCreateUser: createFindOrCreateUser(db),
  categories: createCategoryStore(db),
  transactions: createTransactionStore(db),
  users: createUserStore(db),
  summary: createSummaryStore(db),
})

app.listen(config.port, () => {
  console.log(`Budget+ API listening on http://localhost:${config.port}`)
})
