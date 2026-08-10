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
function post(path: string, fields: Record<string, string>, headers: Record<string, string> = {}) {
  ipCounter += 1
  return app.request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // csrf() requires a same-origin signal; request URL origin is http://localhost
      Origin: 'http://localhost',
      // unique per request so the per-IP rate limiter never trips across tests
      'X-Forwarded-For': `10.2.0.${ipCounter}`,
      ...headers
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
  await db.deleteFrom('kvStorage').where('key', 'like', `sign-in-acct:%${suffix}%`).execute()
  await db.deleteFrom('users').where('normalizedEmail', 'like', `%${suffix}%`).execute()
  await db.destroy()
})

describe('POST /sign-in', () => {
  test('active user with the correct password signs in: redirect, signed cookie, correct JWT claims and ~7-day exp', async () => {
    const user = await seedUser('ok', 'active')
    const res = await post('/sign-in', { email: user.email, password: PASSWORD })
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/')

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

describe('deep-link next param', () => {
  test('a 401 deep link round-trips through sign-in back to the original path', async () => {
    const user = await seedUser('dlnext', 'active')

    // the 401 redirect carries the original path+query in ?next=
    const denied = await app.request('http://localhost/user/settings?tab=email')
    expect(denied.status).toBe(302)
    const location = denied.headers.get('location')
    expect(location).toBe(`/sign-in?next=${encodeURIComponent('/user/settings?tab=email')}`)

    // the sign-in page threads it into the form as a hidden input
    const html = await (await app.request(`http://localhost${location}`)).text()
    expect(html).toContain('name="next"')
    expect(html).toContain('value="/user/settings?tab=email"')

    // and a successful sign-in returns to the deep link instead of /
    const res = await post('/sign-in', { email: user.email, password: PASSWORD, next: '/user/settings?tab=email' })
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/user/settings?tab=email')
  })

  test('an absolute-URL next falls back to / (no open redirect)', async () => {
    const user = await seedUser('dlevil', 'active')
    const res = await post('/sign-in', { email: user.email, password: PASSWORD, next: 'https://evil.example' })
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/')
  })

  test('a protocol-relative next falls back to / (no open redirect)', async () => {
    const user = await seedUser('dlprot', 'active')
    const res = await post('/sign-in', { email: user.email, password: PASSWORD, next: '//evil.example' })
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/')
  })

  test('the sign-in page drops an unsafe next instead of rendering it', async () => {
    const html = await (await app.request('http://localhost/sign-in?next=https%3A%2F%2Fevil.example')).text()
    expect(html).not.toContain('name="next"')
    expect(html).not.toContain('evil.example')
  })
})

describe('no-JS and HTMX error rendering', () => {
  test('a validation error on a plain (no-JS) submit renders the full styled page with the typed email kept', async () => {
    const email = `nojs-${suffix}@example.com`
    const res = await post('/sign-in', { email, password: '' })
    expect(res.status).toBe(200)
    const body = await res.text()
    // the full page (layout with <title> and inline styles), not a bare form fragment
    expect(body).toContain('<title>')
    expect(body).toContain('<style>')
    expect(body).toContain('Password is required.')
    expect(body).toContain(`value="${email}"`)
  })

  test('the same validation error on an HTMX submit returns just the form fragment', async () => {
    const res = await post('/sign-in', { email: `hx-${suffix}@example.com`, password: '' }, { 'HX-Request': 'true' })
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('Password is required.')
    expect(body).not.toContain('<title>')
  })

  test('a per-IP 429 keeps the typed email in the re-rendered form', async () => {
    const email = `iplimit-${suffix}@example.com`
    // a fixed X-Forwarded-For so this test alone trips the per-IP limiter (max 10 per window)
    const headers = { 'X-Forwarded-For': '10.2.99.99' }
    for (let i = 0; i < 10; i++) await post('/sign-in', { email, password: 'Wrong99!x' }, headers)

    const blocked = await post('/sign-in', { email, password: 'Wrong99!x' }, headers)
    expect(blocked.status).toBe(429)
    const body = await blocked.text()
    expect(body).toContain('Too many attempts. Please try again later.')
    expect(body).toContain(`value="${email}"`)
  })
})

describe('per-account failed-login lockout', () => {
  test('10 failures across distinct IPs lock the account: even the correct password is then rejected', async () => {
    const user = await seedUser('lock', 'active')
    for (let i = 0; i < 10; i++) {
      // post() rotates X-Forwarded-For per request, so the per-IP limiter never trips — only the account lockout can
      const res = await post('/sign-in', { email: user.email, password: 'Wrong99!x' })
      expect(await res.text()).toContain('Invalid sign in.')
    }

    const blocked = await post('/sign-in', { email: user.email, password: PASSWORD })
    expect(blocked.status).toBe(429)
    expect(await blocked.text()).toContain('Too many attempts. Please try again later.')
    expect(authCookie(blocked)).toBeUndefined()
  })

  test('a successful sign-in clears the failure counter', async () => {
    const user = await seedUser('clr', 'active')
    for (let i = 0; i < 3; i++) {
      await post('/sign-in', { email: user.email, password: 'Wrong99!x' })
    }
    const ok = await post('/sign-in', { email: user.email, password: PASSWORD })
    expect(ok.status).toBe(303)

    // the counter restarted from zero: one new failure leaves count=1, not 4
    await post('/sign-in', { email: user.email, password: 'Wrong99!x' })
    const kv = await db
      .selectFrom('kvStorage')
      .select('value')
      .where('key', '=', `sign-in-acct:${normalizeEmail(user.email)}`)
      .executeTakeFirst()
    expect(Number(kv?.value)).toBe(1)
  })

  test('an unknown email locks out with the identical response (no enumeration)', async () => {
    const ghost = `ghost-${suffix}@example.com`
    for (let i = 0; i < 10; i++) {
      const res = await post('/sign-in', { email: ghost, password: 'Wrong99!x' })
      expect(await res.text()).toContain('Invalid sign in.')
    }

    const blocked = await post('/sign-in', { email: ghost, password: 'Wrong99!x' })
    expect(blocked.status).toBe(429)
    expect(await blocked.text()).toContain('Too many attempts. Please try again later.')
  })
})
