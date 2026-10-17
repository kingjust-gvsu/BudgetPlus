import { createApp } from './app.ts'
import { createFirebaseTokenVerifier } from './auth.ts'
import { loadConfig } from './config.ts'
import { createDatabase } from './db.ts'
import { createFindOrCreateUser } from './users.ts'

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
})

app.listen(config.port, () => {
  console.log(`Budget+ API listening on http://localhost:${config.port}`)
})
