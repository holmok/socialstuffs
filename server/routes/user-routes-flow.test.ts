import { afterAll, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import EmailAPI from '@api/email-api'
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

const PASSWORD = 'Settings99!ok'

// stub Postmark so no real emails are sent; also lets us assert what was sent
const emailSpy = spyOn(EmailAPI.prototype, 'sendEmail').mockResolvedValue(undefined)

type SeededUser = { id: number; uid: string; email: string; username: string }

async function seedUser(name: string): Promise<SeededUser> {
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
  await db.updateTable('users').set({ status: 'active' }).where('id', '=', row.id).execute()
  return row
}

let ipCounter = 0
function post(path: string, fields: Record<string, string>, cookie?: string) {
  ipCounter += 1
  return app.request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // csrf() requires a same-origin signal; request URL origin is http://localhost
      Origin: 'http://localhost',
      // unique per request so the per-IP rate limiter never trips across tests
      'X-Forwarded-For': `10.3.0.${ipCounter}`,
      ...(cookie ? { cookie } : {})
    },
    body: new URLSearchParams(fields).toString()
  })
}

function get(path: string, cookie?: string, headers: Record<string, string> = {}) {
  return app.request(`http://localhost${path}`, { headers: { ...(cookie ? { cookie } : {}), ...headers } })
}

function authCookie(res: Response): string | undefined {
  return res.headers.getSetCookie().find((s) => s.startsWith(`${config.auth.userCookieName}=`))
}

async function signIn(user: SeededUser): Promise<string> {
  const res = await post('/sign-in', { email: user.email, password: PASSWORD })
  const cookie = authCookie(res)
  if (res.status !== 303 || !cookie) throw new Error('sign-in did not succeed for seeded user')
  return cookie.split(';')[0]
}

// minimal app that unwraps the signed auth cookie and returns the verified JWT claims
const inspect = new Hono()
inspect.get('/claims', async (c) => {
  const token = await getSignedCookie(c, config.auth.cookieSecret, config.auth.userCookieName)
  if (!token) return c.json({ payload: null })
  const payload = await verify(token, config.auth.jwtSecret, 'HS256')
  return c.json({ payload })
})

async function claimsFor(cookie: string): Promise<Record<string, unknown> | null> {
  const res = await inspect.request('/claims', { headers: { cookie } })
  const { payload } = (await res.json()) as { payload: Record<string, unknown> | null }
  return payload
}

// the settings form always posts all four fields; blank password means "keep current password"
function settingsFields(user: { username: string; email: string }, overrides: Record<string, string> = {}) {
  return { username: user.username, email: user.email, password: '', confirmPassword: '', ...overrides }
}

beforeEach(() => {
  __resetRateLimits()
})

afterAll(async () => {
  const users = await db.selectFrom('users').where('normalizedEmail', 'like', `%${suffix}%`).select(['id']).execute()
  const ids = users.map((u) => u.id)
  if (ids.length > 0) {
    await db.deleteFrom('accountValidationTokens').where('userId', 'in', ids).execute()
    await db.deleteFrom('users').where('id', 'in', ids).execute()
  }
  await db.deleteFrom('kvStorage').where('key', 'like', `sign-in-acct:%${suffix}%`).execute()
  emailSpy.mockRestore()
  await db.destroy()
})

describe('auth gating on /user', () => {
  test('unauthenticated GET redirects to /sign-in', async () => {
    const res = await get('/user/settings')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/sign-in')
  })

  test('unauthenticated HTMX GET gets a 401 with HX-Redirect', async () => {
    const res = await get('/user', undefined, { 'HX-Request': 'true' })
    expect(res.status).toBe(401)
    expect(res.headers.get('HX-Redirect')).toBe('/sign-in')
  })

  test('unauthenticated POST /user/settings redirects to /sign-in', async () => {
    const res = await post('/user/settings', { username: 'x', email: 'x@example.com' })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/sign-in')
  })
})

describe('GET /user pages', () => {
  test('/user renders the profile page for a signed-in user', async () => {
    const user = await seedUser('prof')
    const cookie = await signIn(user)
    const res = await get('/user', cookie)
    expect(res.status).toBe(200)
  })

  test('/user/settings pre-fills the current username and email', async () => {
    const user = await seedUser('pre')
    const cookie = await signIn(user)
    const res = await get('/user/settings', cookie)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain(user.username)
    expect(body).toContain(user.email)
  })
})

describe('POST /user/settings — validation', () => {
  test('invalid username re-renders the form with the field error', async () => {
    const user = await seedUser('badname')
    const cookie = await signIn(user)
    const res = await post('/user/settings', settingsFields(user, { username: '_bad' }), cookie)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('hx-post="/user/settings"')
    expect(body).toContain('Username cannot start with an underscore.')
  })

  test('mismatched new passwords re-render the form with the error', async () => {
    const user = await seedUser('pwmis')
    const cookie = await signIn(user)
    const res = await post(
      '/user/settings',
      settingsFields(user, { password: 'NewPass88#ok', confirmPassword: 'Different88#ok' }),
      cookie
    )
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Passwords do not match.')
  })
})

describe('POST /user/settings — no changes', () => {
  test('submitting current values with a blank password redirects without touching the account', async () => {
    const user = await seedUser('same')
    const cookie = await signIn(user)
    const before = emailSpy.mock.calls.length

    const res = await post('/user/settings', settingsFields(user), cookie)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/user/settings')

    const row = await db
      .selectFrom('users')
      .select(['username', 'email', 'status'])
      .where('id', '=', user.id)
      .executeTakeFirstOrThrow()
    expect(row).toEqual({ username: user.username, email: user.email, status: 'active' })
    expect(emailSpy.mock.calls.length).toBe(before)
  })
})

describe('POST /user/settings — username change', () => {
  test('updates the row and re-signs the JWT with the new username', async () => {
    const user = await seedUser('rename')
    const cookie = await signIn(user)
    const newUsername = `nu${suffix}`

    const res = await post('/user/settings', settingsFields(user, { username: newUsername }), cookie)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/user/settings')

    const row = await db
      .selectFrom('users')
      .select(['username', 'normalizedUsername'])
      .where('id', '=', user.id)
      .executeTakeFirstOrThrow()
    expect(row.username).toBe(newUsername)
    expect(row.normalizedUsername).toBe(newUsername.toLowerCase())

    // the response re-signs the auth cookie so the session's username claim is current
    const newCookie = authCookie(res)
    expect(newCookie).toBeDefined()
    const claims = await claimsFor((newCookie as string).split(';')[0])
    expect(claims?.username).toBe(newUsername)
  })

  test('a username already in use is rejected without changing the row', async () => {
    const user = await seedUser('utaken')
    const other = await seedUser('uheld')
    const cookie = await signIn(user)

    const res = await post('/user/settings', settingsFields(user, { username: other.username }), cookie)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Username is already in use.')

    const row = await db.selectFrom('users').select(['username']).where('id', '=', user.id).executeTakeFirstOrThrow()
    expect(row.username).toBe(user.username)
  })
})

describe('POST /user/settings — password change', () => {
  test('rotates pwv, invalidates the old session cookie, and the new password signs in', async () => {
    const user = await seedUser('repw')
    const cookie = await signIn(user)
    const oldClaims = await claimsFor(cookie)
    const NEW_PASSWORD = 'NewPass88#ok'

    const res = await post(
      '/user/settings',
      settingsFields(user, { password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }),
      cookie
    )
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/user/settings')

    // the response carries a re-signed cookie with the new password fingerprint
    const newCookie = (authCookie(res) as string).split(';')[0]
    const newClaims = await claimsFor(newCookie)
    expect(newClaims?.pwv).toBeDefined()
    expect(newClaims?.pwv).not.toBe(oldClaims?.pwv)

    // the re-signed session keeps working; the stale pre-change cookie is revoked by the pwv check
    expect((await get('/user/settings', newCookie)).status).toBe(200)
    const stale = await get('/user/settings', cookie)
    expect(stale.status).toBe(302)
    expect(stale.headers.get('location')).toBe('/sign-in')

    // old password no longer signs in, new one does
    const oldPw = await post('/sign-in', { email: user.email, password: PASSWORD })
    expect(await oldPw.text()).toContain('Invalid sign in.')
    const newPw = await post('/sign-in', { email: user.email, password: NEW_PASSWORD })
    expect(newPw.status).toBe(303)
  })
})

describe('POST /user/settings — email change', () => {
  test('an email already in use is rejected without changing the row', async () => {
    const user = await seedUser('etaken')
    const other = await seedUser('eheld')
    const cookie = await signIn(user)

    const res = await post('/user/settings', settingsFields(user, { email: other.email }), cookie)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Email is already in use.')

    const row = await db.selectFrom('users').select(['email', 'status']).where('id', '=', user.id).executeTakeFirstOrThrow()
    expect(row.email).toBe(user.email)
    expect(row.status).toBe('active')
  })

  test('a new email flips the account to pending, signs the user out, creates a token, and sends both emails', async () => {
    const user = await seedUser('remail')
    const cookie = await signIn(user)
    const newEmail = `remail-new-${suffix}@example.com`
    const before = emailSpy.mock.calls.length

    const res = await post('/user/settings', settingsFields(user, { email: newEmail }), cookie)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/sign-in')
    // the response clears the auth cookie (signed out until the new address is verified)
    expect(authCookie(res)).toContain('Max-Age=0')

    const row = await db
      .selectFrom('users')
      .select(['email', 'normalizedEmail', 'status'])
      .where('id', '=', user.id)
      .executeTakeFirstOrThrow()
    expect(row.status).toBe('pending')
    expect(row.email).toBe(newEmail)
    expect(row.normalizedEmail).toBe(normalizeEmail(newEmail))

    const tokens = await db.selectFrom('accountValidationTokens').select(['id']).where('userId', '=', user.id).execute()
    expect(tokens.length).toBe(1)

    // validation link to the new address, courtesy notice to the old one
    expect(emailSpy.mock.calls.length).toBe(before + 2)
    const [validation] = emailSpy.mock.calls[before] as [{ to: string; template: string }]
    const [notice] = emailSpy.mock.calls[before + 1] as [{ to: string; template: string }]
    expect(validation.to).toBe(newEmail)
    expect(validation.template).toBe('email-change-validation-email')
    expect(notice.to).toBe(user.email)
    expect(notice.template).toBe('email-change-notice-email')

    // the old session no longer grants access (account is pending)
    const stale = await get('/user/settings', cookie)
    expect(stale.status).toBe(302)
    expect(stale.headers.get('location')).toBe('/sign-in')
  })

  test('a validation-email send failure is non-fatal: account is still pending with a token', async () => {
    const user = await seedUser('emfail')
    const cookie = await signIn(user)
    const newEmail = `emfail-new-${suffix}@example.com`
    emailSpy.mockRejectedValueOnce(new Error('postmark down'))

    const res = await post('/user/settings', settingsFields(user, { email: newEmail }), cookie)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/sign-in')

    const row = await db.selectFrom('users').select(['status', 'email']).where('id', '=', user.id).executeTakeFirstOrThrow()
    expect(row.status).toBe('pending')
    expect(row.email).toBe(newEmail)

    const tokens = await db.selectFrom('accountValidationTokens').select(['id']).where('userId', '=', user.id).execute()
    expect(tokens.length).toBe(1)
  })
})

describe('POST /user/sign-out', () => {
  test('clears the auth cookie and redirects home', async () => {
    const user = await seedUser('bye')
    const cookie = await signIn(user)

    const res = await post('/user/sign-out', {}, cookie)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/')
    expect(authCookie(res)).toContain('Max-Age=0')
  })
})
