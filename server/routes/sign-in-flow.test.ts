import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import type { UserStatus } from '@data/user-data'
import { Hono } from 'hono'
import { getSignedCookie } from 'hono/cookie'
import { verify } from 'hono/jwt'
import normalizeEmail from 'normalize-email'
import pino from 'pino'
import LoadConfig from '@/config'
import { __resetRateLimits } from '@/middleware'
import { createApp } from '@/server'

const config = LoadConfig()
const logger = pino({ level: 'silent' })
const { app, db } = createApp(config, logger)

const suffix = Math.random().toString(36).slice(2, 10)

const PASSWORD = 'SignIn99!ok'

type SeededUser = { id: number; uid: string; email: string; username: string }

async function seedUser(name: string, status: UserStatus): Promise<SeededUser> {
  // keep seed names short: username max is 15 chars, so `u${name}` must leave room for the full 8-char random suffix
  const username = `u${name}${suffix}`.slice(0, 15)
  const email = `${name}-${suffix}@example.com`
  const passwordHash = await Bun.password.hash(PASSWORD, { algorithm: 'bcrypt', cost: 10 })
  const row = await db
    .insertInto('users')
    .values({
      uid: `test-${name}-${suffix}`,
      username,
      normalizedUsername: username.toLowerCase(),
      email,
      normalizedEmail: normalizeEmail(email),
      passwordHash
    })
    .returning(['id', 'uid', 'email', 'username'])
    .executeTakeFirstOrThrow()
  // status is not insertable (defaults to 'pending'); flip via update like the other flow tests
  if (status !== 'pending') await db.updateTable('users').set({ status }).where('id', '=', row.id).execute()
  return row
}

let ipCounter = 0
function post(path: string, fields: Record<string, string>) {
  ipCounter += 1
  return app.request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // csrf() requires a same-origin signal; request URL origin is http://localhost
      Origin: 'http://localhost',
      // unique per request so the per-IP rate limiter never trips across tests
      'X-Forwarded-For': `10.2.0.${ipCounter}`
    },
    body: new URLSearchParams(fields).toString()
  })
}

function authCookie(res: Response): string | undefined {
  return res.headers.getSetCookie().find((s) => s.startsWith(`${config.auth.userCookieName}=`))
}

// minimal app that unwraps the signed auth cookie and returns the verified JWT claims
const inspect = new Hono()
inspect.get('/claims', async (c) => {
  const token = await getSignedCookie(c, config.auth.cookieSecret, config.auth.userCookieName)
  if (!token) return c.json({ payload: null })
  const payload = await verify(token, config.auth.jwtSecret, 'HS256')
  return c.json({ payload })
})

beforeEach(() => {
  __resetRateLimits()
})

afterAll(async () => {
  await db.deleteFrom('users').where('normalizedEmail', 'like', `%${suffix}%`).execute()
  await db.destroy()
})

describe('POST /sign-in', () => {
  test('active user with the correct password signs in: redirect, signed cookie, correct JWT claims and ~7-day exp', async () => {
    const user = await seedUser('ok', 'active')
    const res = await post('/sign-in', { email: user.email, password: PASSWORD })
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/user')

    const cookie = authCookie(res)
    expect(cookie).toBeDefined()

    const claimsRes = await inspect.request('/claims', { headers: { cookie: (cookie as string).split(';')[0] } })
    const { payload } = (await claimsRes.json()) as { payload: Record<string, unknown> | null }
    expect(payload).not.toBeNull()
    if (!payload) throw new Error('no jwt payload')
    expect(payload.uid).toBe(user.uid)
    expect(payload.username).toBe(user.username)
    expect(payload.status).toBe('active')
    expect(payload.role).toBe('user')
    // 604800 = 7 days in seconds; allow a few seconds of slack for test runtime
    const delta = (payload.exp as number) - Math.floor(Date.now() / 1000)
    expect(delta).toBeGreaterThanOrEqual(604700)
    expect(delta).toBeLessThanOrEqual(604800)
  })

  test('pending user is told to validate their email and gets no auth cookie', async () => {
    const user = await seedUser('pend', 'pending')
    const res = await post('/sign-in', { email: user.email, password: PASSWORD })
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('Please validate your email address before signing in.')
    expect(authCookie(res)).toBeUndefined()
  })

  test('deleted user gets the same generic error as bad credentials (no status leak)', async () => {
    const user = await seedUser('del', 'deleted')
    const res = await post('/sign-in', { email: user.email, password: PASSWORD })
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('Invalid sign in.')
    expect(body).not.toContain('validate your email')
    expect(authCookie(res)).toBeUndefined()
  })

  test('inactive user gets the same generic error as bad credentials (no status leak)', async () => {
    const user = await seedUser('inact', 'inactive')
    const res = await post('/sign-in', { email: user.email, password: PASSWORD })
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('Invalid sign in.')
    expect(body).not.toContain('validate your email')
    expect(authCookie(res)).toBeUndefined()
  })

  test('wrong password for an active user gets the generic error and no auth cookie', async () => {
    const user = await seedUser('badpw', 'active')
    const res = await post('/sign-in', { email: user.email, password: 'Wrong99!pass' })
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('Invalid sign in.')
    expect(authCookie(res)).toBeUndefined()
  })
})
