import { afterAll, describe, expect, test } from 'bun:test'
import getDatabase from '@data/index'
import SystemRoutes from '@routes/system-routes'
import { Hono } from 'hono'
import pino from 'pino'
import LoadConfig from '@/config'
import { createApp } from '@/server'

const config = LoadConfig()
const logger = pino({ level: 'silent' })
const { app, db } = createApp(config, logger)

afterAll(async () => {
  await db.destroy()
})

describe('system routes', () => {
  test('GET /liveness returns 200 alive', async () => {
    const res = await app.request('http://localhost/liveness')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'alive' })
  })

  test('GET /start-up returns 200 ready when the database responds', async () => {
    const res = await app.request('http://localhost/start-up')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ready' })
  })

  test('GET /start-up returns 500 when the database query fails', async () => {
    // a pool aimed at an unreachable port rejects every query, simulating a database outage
    const deadDb = getDatabase(
      { connectionString: 'postgres://localhost:1/unreachable', connectionTimeoutMillis: 1000 },
      config.dbSchema,
      logger
    )

    const broken = new Hono()
    broken.use(async (c, next) => {
      c.set('db', deadDb)
      await next()
    })
    SystemRoutes(broken, logger)

    const res = await broken.request('http://localhost/start-up')
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Failed to start up' })
    await deadDb.destroy()
  })
})
