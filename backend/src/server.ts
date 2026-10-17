import { createApp } from './app.ts'
import { loadConfig } from './config.ts'
import { createDatabase } from './db.ts'

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
})

app.listen(config.port, () => {
  console.log(`Budget+ API listening on http://localhost:${config.port}`)
})
