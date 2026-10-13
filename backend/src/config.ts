// Reads settings from environment variables, with defaults for local development.

export type Config = {
  port: number
  corsOrigin: string
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 4000),
    corsOrigin: env.CORS_ORIGIN ?? 'http://localhost:5173',
  }
}
