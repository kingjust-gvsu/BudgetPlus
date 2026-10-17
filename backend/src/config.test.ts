import { describe, expect, it } from 'vitest'
import { loadConfig } from './config.ts'

const requiredSettings = {
  DATABASE_URL: 'postgresql://localhost/test',
  FIREBASE_PROJECT_ID: 'budget-plus-test',
}

describe('loadConfig', () => {
  it('uses defaults for optional settings', () => {
    const config = loadConfig(requiredSettings)

    expect(config).toEqual({
      port: 4000,
      corsOrigin: 'http://localhost:5173',
      databaseUrl: 'postgresql://localhost/test',
      firebaseProjectId: 'budget-plus-test',
    })
  })

  it('fails with a helpful message when DATABASE_URL is missing', () => {
    expect(() => loadConfig({ FIREBASE_PROJECT_ID: 'x' })).toThrow(/DATABASE_URL is not set/)
  })

  it('fails with a helpful message when FIREBASE_PROJECT_ID is missing', () => {
    expect(() => loadConfig({ DATABASE_URL: 'x' })).toThrow(/FIREBASE_PROJECT_ID is not set/)
  })
})
