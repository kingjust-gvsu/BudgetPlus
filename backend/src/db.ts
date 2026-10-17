import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client.ts'

export type Database = PrismaClient

// Creates the Prisma client, which is how the backend reads and writes PostgreSQL.
export function createDatabase(databaseUrl: string): Database {
  const adapter = new PrismaPg({ connectionString: databaseUrl })
  return new PrismaClient({ adapter })
}
