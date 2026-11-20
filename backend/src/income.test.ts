import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { incomeForMonth, type IncomeData } from './income.ts'
import { createFakeIncomeStore, fakeDependencies, testUser, VALID_TOKEN } from './test/fakes.ts'

const data: IncomeData = {
  sources: [
    { id: 'job-1', name: 'Income 1', amounts: [{ month: '2026-01', amountCents: 260000 }, { month: '2026-03', amountCents: 280000 }] },
    { id: 'job-2', name: 'Income 2', amounts: [{ month: '2026-06', amountCents: 180000 }] },
  ],
  other: new Map([['2026-03', 150000]]),
}

describe('incomeForMonth', () => {
  it('carries each source over from the most recent month it was set, leaving out ones not started', () => {
    expect(incomeForMonth(data, '2026-02')).toEqual({
      month: '2026-02',
      sources: [{ id: 'job-1', name: 'Income 1', amountCents: 260000, setIn: '2026-01' }], // Income 2 starts in June
      otherCents: 0,
      totalCents: 260000,
    })
  })

  it('leaves out a source from the month it stopped', () => {
    const stopped = {
      ...data,
      sources: [{ id: 'job-1', name: 'Income 1', amounts: [{ month: '2026-01', amountCents: 260000 }, { month: '2026-04', amountCents: 0 }] }],
    }

    expect(incomeForMonth(stopped, '2026-03').sources).toHaveLength(1)
    expect(incomeForMonth(stopped, '2026-05')).toMatchObject({ sources: [], otherCents: 0, totalCents: 0 })
  })

  it('uses a change from its month on', () => {
    expect(incomeForMonth(data, '2026-08').sources.map((s) => s.amountCents)).toEqual([280000, 180000])
  })

  it('counts other income only in its own month', () => {
    expect(incomeForMonth(data, '2026-03').totalCents).toBe(280000 + 150000)
    expect(incomeForMonth(data, '2026-04').totalCents).toBe(280000)
  })

  it('has no total when there is no income at all', () => {
    expect(incomeForMonth({ sources: [], other: new Map() }, '2026-03').totalCents).toBeNull()
  })
})

describe('/api/income', () => {
  const auth = { Authorization: `Bearer ${VALID_TOKEN}` }
  const setup = () => {
    const income = createFakeIncomeStore()
    return { app: createApp({ corsOrigin: 'http://localhost:5173' }, fakeDependencies({ income })), income }
  }

  it('adds a source and shows the month', async () => {
    const { app } = setup()

    const response = await request(app).post('/api/income/sources').set(auth).send({ name: 'Income 1', amountCents: 260000, month: '2026-03' })

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({ month: '2026-03', totalCents: 260000, sources: [{ name: 'Income 1', setIn: '2026-03' }] })
  })

  it('changes an amount from a month on, and later months follow', async () => {
    const { app } = setup()
    const created = await request(app).post('/api/income/sources').set(auth).send({ name: 'Income 1', amountCents: 260000, month: '2026-01' })
    const id = created.body.sources[0].id

    await request(app).patch(`/api/income/sources/${id}`).set(auth).send({ month: '2026-03', amountCents: 280000 })

    const february = await request(app).get('/api/income?month=2026-02').set(auth)
    const may = await request(app).get('/api/income?month=2026-05').set(auth)
    expect(february.body.totalCents).toBe(260000)
    expect(may.body.sources[0]).toMatchObject({ amountCents: 280000, setIn: '2026-03' })
  })

  it('renames a source', async () => {
    const { app } = setup()
    const created = await request(app).post('/api/income/sources').set(auth).send({ name: 'Job', amountCents: 100, month: '2026-01' })

    const renamed = await request(app)
      .patch(`/api/income/sources/${created.body.sources[0].id}`)
      .set(auth)
      .send({ month: '2026-01', name: 'Day job' })

    expect(renamed.body.sources[0].name).toBe('Day job')
  })

  it('stops a source from a month on, keeping it in earlier months', async () => {
    const { app } = setup()
    const created = await request(app).post('/api/income/sources').set(auth).send({ name: 'Job', amountCents: 300000, month: '2026-01' })

    const stopped = await request(app).delete(`/api/income/sources/${created.body.sources[0].id}?month=2026-05`).set(auth)
    const april = await request(app).get('/api/income?month=2026-04').set(auth)
    const june = await request(app).get('/api/income?month=2026-06').set(auth)

    expect(stopped.body).toMatchObject({ month: '2026-05', sources: [], totalCents: 0 })
    expect(april.body.totalCents).toBe(300000)
    expect(june.body.sources).toEqual([])
  })

  it('removes a source completely when stopped in the month it started', async () => {
    const { app } = setup()
    const created = await request(app).post('/api/income/sources').set(auth).send({ name: 'Job', amountCents: 300000, month: '2026-05' })

    const stopped = await request(app).delete(`/api/income/sources/${created.body.sources[0].id}?month=2026-05`).set(auth)

    expect(stopped.body).toMatchObject({ sources: [], totalCents: null })
  })

  it('restarts a stopped source when one with the same name is added', async () => {
    const { app } = setup()
    const created = await request(app).post('/api/income/sources').set(auth).send({ name: 'Job', amountCents: 300000, month: '2026-01' })
    const id = created.body.sources[0].id
    await request(app).delete(`/api/income/sources/${id}?month=2026-03`).set(auth)

    const restarted = await request(app).post('/api/income/sources').set(auth).send({ name: 'Job', amountCents: 320000, month: '2026-08' })
    const may = await request(app).get('/api/income?month=2026-05').set(auth)

    expect(restarted.status).toBe(201)
    expect(restarted.body.sources).toEqual([{ id, name: 'Job', amountCents: 320000, setIn: '2026-08' }])
    expect(may.body.sources).toEqual([])
  })

  it('sets and clears other income for one month', async () => {
    const { app, income } = setup()

    const set = await request(app).put('/api/income/other').set(auth).send({ month: '2026-03', amountCents: 150000 })
    await request(app).put('/api/income/other').set(auth).send({ month: '2026-03', amountCents: 0 })

    expect(set.body).toMatchObject({ otherCents: 150000, totalCents: 150000 })
    expect(income.data.get(testUser.id)?.other.size).toBe(0)
  })

  it('rejects a duplicate source name', async () => {
    const { app } = setup()
    await request(app).post('/api/income/sources').set(auth).send({ name: 'Job', amountCents: 100, month: '2026-01' })

    const response = await request(app).post('/api/income/sources').set(auth).send({ name: 'Job', amountCents: 200, month: '2026-01' })

    expect(response.status).toBe(409)
  })

  it.each([
    ['a missing month', { name: 'Job', amountCents: 100 }, 'month must be a month like 2026-10'],
    ['a negative amount', { name: 'Job', amountCents: -5, month: '2026-01' }, 'Amount must be a whole number of cents, zero or more'],
  ])('rejects %s', async (_case, body, error) => {
    const response = await request(setup().app).post('/api/income/sources').set(auth).send(body)

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error })
  })

  it("can't change another user's source", async () => {
    const { app } = setup()

    const response = await request(app)
      .patch('/api/income/sources/10000000-0000-0000-0000-000000000099')
      .set(auth)
      .send({ month: '2026-01', amountCents: 5 })

    expect(response.status).toBe(404)
  })
})
