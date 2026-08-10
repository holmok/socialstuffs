import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { __fillRateLimitKeys, __resetRateLimits } from '@middleware/rate-limit-middleware'
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

describe('rateLimit with TRUST_PROXY=false', () => {
  beforeEach(() => {
    __resetRateLimits()
  })

  test('spoofed X-Forwarded-For headers are ignored and share one bucket', async () => {
    const untrusting = createApp({ ...config, server: { ...config.server, trustProxy: false } }, logger)
    const request = (ip: string) =>
      untrusting.app.request('http://localhost/sign-in', {
        method: 'POST',
        headers: { 'X-Forwarded-For': ip, 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'http://localhost' },
        body: 'email=&password='
      })

    // every request claims a different forwarded IP, but without a trusted proxy they all
    // resolve to the same socket identity, so rotating the header can't reset the window
    for (let i = 0; i < 10; i++) {
      expect((await request(`203.0.113.${i}`)).status).toBe(200)
    }
    expect((await request('203.0.113.200')).status).toBe(429)
    await untrusting.db.destroy()
  })
})

describe('rateLimit overflow (MAX_TRACKED_KEYS)', () => {
  beforeEach(() => {
    __resetRateLimits()
  })

  test('a key-flood past the cap preserves existing blocks and lets new keys pass untracked', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await signIn('203.0.113.20')).status).toBe(200)
    }
    expect((await signIn('203.0.113.20')).status).toBe(429)

    // flood the map past the 10k cap with unexpired keys
    __fillRateLimitKeys(10_001, 60_000)

    // the existing block must survive (previously windows.clear() wiped it)
    expect((await signIn('203.0.113.20')).status).toBe(429)
    // a brand-new key passes untracked instead of wiping state or being denied
    expect((await signIn('203.0.113.77')).status).toBe(200)
    // and the block still stands afterwards
    expect((await signIn('203.0.113.20')).status).toBe(429)
  })
})
