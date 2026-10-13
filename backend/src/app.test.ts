import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from './app.ts'

const app = createApp({ corsOrigin: 'http://localhost:5173' })

describe('GET /api/health', () => {
  it('reports that the API is running', async () => {
    const response = await request(app).get('/api/health')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok' })
  })
})

describe('unknown API routes', () => {
  it('return 404 as JSON', async () => {
    const response = await request(app).get('/api/does-not-exist')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'Not found' })
  })
})
