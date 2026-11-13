import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from './app.ts'
import { fakeDependencies, testUser, VALID_TOKEN } from './test/fakes.ts'

const config = { corsOrigin: 'http://localhost:5173' }

describe('PATCH /api/me', () => {
  it('sets the monthly income', async () => {
    const app = createApp(config, fakeDependencies())

    const response = await request(app)
      .patch('/api/me')
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ monthlyIncomeCents: 400000 })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ...testUser, monthlyIncomeCents: 400000 })
  })

  it('rejects an income that is not whole cents', async () => {
    const app = createApp(config, fakeDependencies())

    const response = await request(app)
      .patch('/api/me')
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .send({ monthlyIncomeCents: 4000.5 })

    expect(response.status).toBe(400)
  })
})

describe('GET /api/me', () => {
  it('returns the signed-in user', async () => {
    const app = createApp(config, fakeDependencies())

    const response = await request(app).get('/api/me').set('Authorization', `Bearer ${VALID_TOKEN}`)

    expect(response.status).toBe(200)
    expect(response.body).toEqual(testUser)
  })

  it('finds or creates the user from the Firebase identity', async () => {
    const findOrCreateUser = vi.fn().mockResolvedValue(testUser)
    const app = createApp(config, fakeDependencies({ findOrCreateUser }))

    await request(app).get('/api/me').set('Authorization', `Bearer ${VALID_TOKEN}`)

    expect(findOrCreateUser).toHaveBeenCalledWith({ uid: testUser.firebaseUid, email: testUser.email })
  })

  it('rejects requests without a token', async () => {
    const app = createApp(config, fakeDependencies())

    const response = await request(app).get('/api/me')

    expect(response.status).toBe(401)
    expect(response.body).toEqual({ error: 'Not signed in' })
  })

  it('rejects requests with an invalid token', async () => {
    const app = createApp(config, fakeDependencies())

    const response = await request(app).get('/api/me').set('Authorization', 'Bearer not-a-real-token')

    expect(response.status).toBe(401)
    expect(response.body).toEqual({ error: 'Invalid or expired sign-in' })
  })
})
