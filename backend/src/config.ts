// Reads settings from environment variables, with defaults for local development.

export type Config = {
  port: number
  corsOrigin: string
  databaseUrl: string
  firebaseProjectId: string
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]
  if (!value) {
    throw new Error(`${name} is not set. Copy backend/.env.example to backend/.env and fill it in.`)
  }
  return value
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 4000),
    corsOrigin: env.CORS_ORIGIN ?? 'http://localhost:5173',
    databaseUrl: required(env, 'DATABASE_URL'),
    firebaseProjectId: required(env, 'FIREBASE_PROJECT_ID'),
  }
}
