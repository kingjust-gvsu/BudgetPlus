import { describe, expect, it } from 'vitest'
import { loadConfig } from './config.ts'

describe('loadConfig', () => {
  it('uses defaults for optional settings', () => {
    const config = loadConfig({ DATABASE_URL: 'postgresql://localhost/test' })

    expect(config).toEqual({
      port: 4000,
      corsOrigin: 'http://localhost:5173',
      databaseUrl: 'postgresql://localhost/test',
    })
  })

  it('fails with a helpful message when DATABASE_URL is missing', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL is not set/)
  })
})
