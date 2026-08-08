import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { __resetRateLimits } from '@middleware/rate-limit-middleware'
import pino from 'pino'
import LoadConfig from '@/config'
import { createApp } from '@/server'

const config = LoadConfig()
const logger = pino({ level: 'silent' })
const { app, db } = createApp(config, logger)

afterAll(async () => {
  await db.destroy()
})

function signIn(ip: string) {
  // Origin must match the request origin so csrf() (registered before the routes) admits the POST.
  return app.request('http://localhost/sign-in', {
    method: 'POST',
    headers: {
      'X-Forwarded-For': ip,
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: 'http://localhost'
    },
    body: 'email=&password='
  })
}

describe('rateLimit', () => {
  beforeEach(() => {
    __resetRateLimits()
  })

  test('returns 429 past the limit and does not affect other IPs', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await signIn('203.0.113.10')
      expect(res.status).toBe(200)
    }

    const limited = await signIn('203.0.113.10')
    expect(limited.status).toBe(429)
    expect(await limited.text()).toContain('Too many attempts. Please try again later.')

    const other = await signIn('203.0.113.99')
    expect(other.status).toBe(200)
  })

  test('rotating the first x-forwarded-for entry does not bypass the limit (keyed on last entry)', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await signIn(`10.0.0.${i}, 198.51.100.7`)
      expect(res.status).toBe(200)
    }

    const limited = await signIn('10.0.0.250, 198.51.100.7')
    expect(limited.status).toBe(429)
  })
})
