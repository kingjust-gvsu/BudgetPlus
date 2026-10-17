import { existsSync } from 'node:fs'
import { defineConfig } from 'prisma/config'

// Load backend/.env for Prisma CLI commands (migrate, generate, studio).
// In CI there is no .env file; DATABASE_URL comes from the environment instead.
if (existsSync('.env')) {
  process.loadEnvFile('.env')
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
})
