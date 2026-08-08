import { afterAll, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import EmailAPI from '@api/email-api'
import normalizeEmail from 'normalize-email'
import pino from 'pino'
import Uniquey from 'uniquey'
import LoadConfig from '@/config'
import { __resetRateLimits } from '@/middleware'
import { createApp } from '@/server'

const config = LoadConfig()
const logger = pino({ level: 'silent' })
const { app, db } = createApp(config, logger)

const suffix = Math.random().toString(36).slice(2, 10)
const tokenUniquey = new Uniquey({ length: 32 })

// stub Postmark so no real emails are sent; also lets us assert whether a send was attempted
const emailSpy = spyOn(EmailAPI.prototype, 'sendEmail').mockResolvedValue(undefined)

const STRONG_PASSWORD = 'NewPass99!'

type SeededUser = { id: number; uid: string; email: string; passwordHash: string }

async function seedUser(name: string, active = true): Promise<SeededUser> {
  const username = `u${name}${suffix}`.slice(0, 15)
  const email = `${name}-${suffix}@example.com`
  const passwordHash = await Bun.password.hash('OldPass99!', { algorithm: 'bcrypt', cost: 10 })
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
    .returning(['id', 'uid', 'email'])
    .executeTakeFirstOrThrow()
  // status is not insertable (defaults to 'pending'); flip to active via update like the sign-up flow test
  if (active) await db.updateTable('users').set({ status: 'active' }).where('id', '=', row.id).execute()
  return { ...row, passwordHash }
}

async function insertToken(userId: number, opts: { created?: Date } = {}) {
  const token = tokenUniquey.create()
  await db.insertInto('passwordRecoveryTokens').values({ token, userId }).execute()
  // `created` is not insertable in the Kysely types; backdate via update (cast past the `never`)
  if (opts.created) {
    await db
      .updateTable('passwordRecoveryTokens')
      .set({ created: opts.created } as never)
      .where('token', '=', token)
      .execute()
  }
  return token
}

async function tokenCount(userId: number) {
  const rows = await db.selectFrom('passwordRecoveryTokens').where('userId', '=', userId).select(['id']).execute()
  return rows.length
}

async function passwordHashById(id: number) {
  const row = await db.selectFrom('users').where('id', '=', id).select(['passwordHash']).executeTakeFirstOrThrow()
  return row.passwordHash
}

async function tokenClaimed(token: string) {
  const row = await db.selectFrom('passwordRecoveryTokens').where('token', '=', token).select(['claimed']).executeTakeFirst()
  return row?.claimed ?? null
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
      'X-Forwarded-For': `10.1.0.${ipCounter}`
    },
    body: new URLSearchParams(fields).toString()
  })
}

function get(path: string) {
  ipCounter += 1
  return app.request(`http://localhost${path}`, {
    method: 'GET',
    headers: { 'X-Forwarded-For': `10.1.0.${ipCounter}` }
  })
}

beforeEach(() => {
  __resetRateLimits()
})

afterAll(async () => {
  const users = await db.selectFrom('users').where('normalizedEmail', 'like', `%${suffix}%`).select(['id']).execute()
  const ids = users.map((u) => u.id)
  if (ids.length > 0) {
    await db.deleteFrom('passwordRecoveryTokens').where('userId', 'in', ids).execute()
    await db.deleteFrom('users').where('id', 'in', ids).execute()
  }
  emailSpy.mockRestore()
  await db.destroy()
})

describe('POST /recover-password', () => {
  test('active user gets a fresh token, one email, and a neutral redirect', async () => {
    const user = await seedUser('recoveractive')
    expect(await tokenCount(user.id)).toBe(0)
    const before = emailSpy.mock.calls.length

    const res = await post('/recover-password', { email: user.email })
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/sign-in')
    expect(await tokenCount(user.id)).toBe(1)
    expect(emailSpy.mock.calls.length).toBe(before + 1)
  })

  test('unknown email returns the same neutral redirect and sends nothing', async () => {
    const before = emailSpy.mock.calls.length
    const res = await post('/recover-password', { email: `ghost-${suffix}@example.com` })
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/sign-in')
    expect(emailSpy.mock.calls.length).toBe(before)
  })

  test('non-active user returns the same neutral redirect and creates no token', async () => {
    const user = await seedUser('recoverpending', false)
    const before = emailSpy.mock.calls.length
    const res = await post('/recover-password', { email: user.email })
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/sign-in')
    expect(await tokenCount(user.id)).toBe(0)
    expect(emailSpy.mock.calls.length).toBe(before)
  })
})

describe('GET /recover-password/:token/:uid', () => {
  test('valid token renders the set-password form', async () => {
    const user = await seedUser('getvalid')
    const token = await insertToken(user.id)
    const res = await get(`/recover-password/${token}/${user.uid}`)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain(`hx-post="/recover-password/${token}/${user.uid}"`)
    expect(body).toContain('name="password"')
    expect(body).toContain('name="confirmPassword"')
  })

  test('unknown token renders the failure page', async () => {
    const user = await seedUser('getunknown')
    const res = await get(`/recover-password/does-not-exist/${user.uid}`)
    expect(res.status).toBe(400)
    const body = await res.text()
    expect(body).toContain('Invalid password reset link.')
  })

  test('wrong uid renders the failure page', async () => {
    const user = await seedUser('getwronguid')
    const token = await insertToken(user.id)
    const res = await get(`/recover-password/${token}/wrong-uid`)
    expect(res.status).toBe(400)
    const body = await res.text()
    expect(body).toContain('Invalid password reset link.')
  })

  test('expired token renders the failure page', async () => {
    const user = await seedUser('getexpired')
    const old = new Date(Date.now() - 49 * 60 * 60 * 1000)
    const token = await insertToken(user.id, { created: old })
    const res = await get(`/recover-password/${token}/${user.uid}`)
    expect(res.status).toBe(400)
    const body = await res.text()
    expect(body).toContain('Invalid password reset link.')
  })
})

describe('POST /recover-password/:token/:uid', () => {
  test('valid token + strong matching password updates the password, claims the token, redirects', async () => {
    const user = await seedUser('resetok')
    const token = await insertToken(user.id)

    const res = await post(`/recover-password/${token}/${user.uid}`, {
      password: STRONG_PASSWORD,
      confirmPassword: STRONG_PASSWORD
    })
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/sign-in')

    const newHash = await passwordHashById(user.id)
    expect(newHash).not.toBe(user.passwordHash)
    expect(await Bun.password.verify(STRONG_PASSWORD, newHash, 'bcrypt')).toBe(true)
    expect(await tokenClaimed(token)).not.toBeNull()

    // second use of the same token is rejected
    const res2 = await post(`/recover-password/${token}/${user.uid}`, {
      password: 'Another99!',
      confirmPassword: 'Another99!'
    })
    expect(res2.status).toBe(400)
    const body2 = await res2.text()
    expect(body2).toContain('Invalid password reset link.')
    // password unchanged by the rejected second attempt
    expect(await Bun.password.verify(STRONG_PASSWORD, await passwordHashById(user.id), 'bcrypt')).toBe(true)
  })

  test('weak password re-renders the form with errors and does not change the password', async () => {
    const user = await seedUser('resetweak')
    const token = await insertToken(user.id)

    const res = await post(`/recover-password/${token}/${user.uid}`, {
      password: 'weak',
      confirmPassword: 'weak'
    })
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain(`hx-post="/recover-password/${token}/${user.uid}"`)
    expect(body).toContain('class="errors"')

    expect(await passwordHashById(user.id)).toBe(user.passwordHash)
    expect(await tokenClaimed(token)).toBeNull()
  })

  test('mismatched confirm re-renders the form with errors and does not change the password', async () => {
    const user = await seedUser('resetmismatch')
    const token = await insertToken(user.id)

    const res = await post(`/recover-password/${token}/${user.uid}`, {
      password: STRONG_PASSWORD,
      confirmPassword: 'Different99!'
    })
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('Passwords do not match.')

    expect(await passwordHashById(user.id)).toBe(user.passwordHash)
    expect(await tokenClaimed(token)).toBeNull()
  })

  test('expired unclaimed token fails closed: failure page and password unchanged', async () => {
    const user = await seedUser('resetexpired')
    const old = new Date(Date.now() - 49 * 60 * 60 * 1000)
    const token = await insertToken(user.id, { created: old })

    const res = await post(`/recover-password/${token}/${user.uid}`, {
      password: STRONG_PASSWORD,
      confirmPassword: STRONG_PASSWORD
    })
    expect(res.status).toBe(400)
    const body = await res.text()
    expect(body).toContain('Invalid password reset link.')

    // password NOT changed by the expired token
    expect(await passwordHashById(user.id)).toBe(user.passwordHash)
    expect(await Bun.password.verify('OldPass99!', await passwordHashById(user.id), 'bcrypt')).toBe(true)
  })

  test('wrong uid fails closed without burning the token; the real link still works after', async () => {
    const user = await seedUser('resetwronguid')
    const token = await insertToken(user.id)

    const res = await post(`/recover-password/${token}/wrong-uid`, {
      password: STRONG_PASSWORD,
      confirmPassword: STRONG_PASSWORD
    })
    expect(res.status).toBe(400)
    const body = await res.text()
    expect(body).toContain('Invalid password reset link.')

    // password unchanged AND the token was NOT claimed (no DoS on the legit link)
    expect(await passwordHashById(user.id)).toBe(user.passwordHash)
    expect(await tokenClaimed(token)).toBeNull()

    // the real link still works with the correct uid
    const res2 = await post(`/recover-password/${token}/${user.uid}`, {
      password: STRONG_PASSWORD,
      confirmPassword: STRONG_PASSWORD
    })
    expect(res2.status).toBe(303)
    expect(res2.headers.get('location')).toBe('/sign-in')
    expect(await Bun.password.verify(STRONG_PASSWORD, await passwordHashById(user.id), 'bcrypt')).toBe(true)
    expect(await tokenClaimed(token)).not.toBeNull()
  })
})
