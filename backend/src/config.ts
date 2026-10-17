// Reads settings from environment variables, with defaults for local development.

export type Config = {
  port: number
  corsOrigin: string
  databaseUrl: string
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set. Copy backend/.env.example to backend/.env and fill it in.')
  }

  return {
    port: Number(env.PORT ?? 4000),
    corsOrigin: env.CORS_ORIGIN ?? 'http://localhost:5173',
    databaseUrl,
  }
}
