import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from './app.ts'

const config = { corsOrigin: 'http://localhost:5173' }
const databaseUp = async () => true
const databaseDown = async () => false

describe('GET /api/health', () => {
  it('reports ok when the database is reachable', async () => {
    const app = createApp(config, { checkDatabase: databaseUp })

    const response = await request(app).get('/api/health')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok', database: 'ok' })
  })

  it('reports degraded when the database is unreachable', async () => {
    const app = createApp(config, { checkDatabase: databaseDown })

    const response = await request(app).get('/api/health')

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ status: 'degraded', database: 'unavailable' })
  })
})

describe('unknown API routes', () => {
  it('return 404 as JSON', async () => {
    const app = createApp(config, { checkDatabase: databaseUp })

    const response = await request(app).get('/api/does-not-exist')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'Not found' })
  })
})
