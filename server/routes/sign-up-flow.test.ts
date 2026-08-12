import { afterAll, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import EmailAPI from '@api/email-api'
import normalizeEmail from 'normalize-email'
import pino from 'pino'
import LoadConfig from '@/config'
import { __resetRateLimits } from '@/middleware'
import { createApp } from '@/server'
import { BACKDOOR_INVITE_CODE, INVITE_CODES_PER_USER } from './invite-helpers'

const config = LoadConfig()
const logger = pino({ level: 'silent' })
const { app, db } = createApp(config, logger)

const suffix = Math.random().toString(36).slice(2, 10)

// stub Postmark so no real emails are sent; also lets us assert whether a send was attempted
const emailSpy = spyOn(EmailAPI.prototype, 'sendEmail').mockResolvedValue(undefined)

const VALID_PASSWORD = 'Abcdefgh1!'

type SeededUser = { id: number; uid: string; email: string }

async function seedUser(name: string, domain = 'example.com'): Promise<SeededUser> {
  const username = `u${name}${suffix}`.slice(0, 15)
  const email = `${name}-${suffix}@${domain}`
  return await db
    .insertInto('users')
    .values({
      uid: `test-${name}-${suffix}`,
      username,
      normalizedUsername: username.toLowerCase(),
      email,
      normalizedEmail: normalizeEmail(email),
      passwordHash: 'not-a-real-hash'
    })
    .returning(['id', 'uid', 'email'])
    .executeTakeFirstOrThrow()
}

async function setActive(id: number) {
  await db.updateTable('users').set({ status: 'active' }).where('id', '=', id).execute()
}

async function userByEmail(email: string) {
  return await db
    .selectFrom('users')
    .where('normalizedEmail', '=', normalizeEmail(email))
    .select(['id', 'status'])
    .executeTakeFirst()
}

async function tokenCount(userId: number) {
  const rows = await db.selectFrom('accountValidationTokens').where('userId', '=', userId).select(['id']).execute()
  return rows.length
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
      'X-Forwarded-For': `10.0.0.${ipCounter}`
    },
    body: new URLSearchParams(fields).toString()
  })
}

beforeEach(() => {
  __resetRateLimits()
})

afterAll(async () => {
  const users = await db.selectFrom('users').where('normalizedEmail', 'like', `%${suffix}%`).select(['id']).execute()
  const ids = users.map((u) => u.id)
  if (ids.length > 0) {
    await db.deleteFrom('accountValidationTokens').where('userId', 'in', ids).execute()
    // favorites created by invite claims (no FK cascade); inviteCodes cascade with the user rows
    await db.deleteFrom('favorites').where('userId', 'in', ids).execute()
    await db.deleteFrom('favorites').where('friendId', 'in', ids).execute()
    await db.deleteFrom('users').where('id', 'in', ids).execute()
  }
  await db.deleteFrom('waitlist').where('email', 'like', `%${suffix}%`).execute()
  emailSpy.mockRestore()
  await db.destroy()
})

describe('POST /sign-up', () => {
  test('malformed post missing email and username re-renders the form with errors, not a 500', async () => {
    const res = await post('/sign-up', { password: VALID_PASSWORD, confirmPassword: VALID_PASSWORD })
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('hx-post="/sign-up"')
    expect(body).toContain('class="errors"')
  })

  test('duplicate email surfaces "Email is already in use."', async () => {
    const existing = await seedUser('dupemail')
    const res = await post('/sign-up', {
      inviteCode: BACKDOOR_INVITE_CODE,
      username: `newu${suffix}`.slice(0, 15),
      email: existing.email,
      confirmEmail: existing.email,
      password: VALID_PASSWORD,
      confirmPassword: VALID_PASSWORD
    })
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('Email is already in use.')
  })

  test('gmail dot/plus alias of an existing email is rejected as a duplicate', async () => {
    // normalize-email strips dots and +suffixes only for gmail/googlemail domains
    const existing = await seedUser('aliasdup', 'gmail.com')
    const alias = `alias.dup-${suffix}+spam@gmail.com`
    // guard: the variant must actually collapse to the seeded account's normalized email
    expect(normalizeEmail(alias)).toBe(normalizeEmail(existing.email))

    const res = await post('/sign-up', {
      inviteCode: BACKDOOR_INVITE_CODE,
      username: `ualias${suffix}`.slice(0, 15),
      email: alias,
      confirmEmail: alias,
      password: VALID_PASSWORD,
      confirmPassword: VALID_PASSWORD
    })
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('Email is already in use.')
    // no second account was created for the same normalized email
    const rows = await db.selectFrom('users').where('normalizedEmail', '=', normalizeEmail(alias)).select(['id']).execute()
    expect(rows.length).toBe(1)
  })

  test('uppercase variant of an existing email is rejected as a duplicate', async () => {
    const existing = await seedUser('casedup')
    const alias = existing.email.toUpperCase()
    expect(normalizeEmail(alias)).toBe(normalizeEmail(existing.email))

    const res = await post('/sign-up', {
      inviteCode: BACKDOOR_INVITE_CODE,
      username: `ucase${suffix}`.slice(0, 15),
      email: alias,
      confirmEmail: alias,
      password: VALID_PASSWORD,
      confirmPassword: VALID_PASSWORD
    })
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('Email is already in use.')
  })

  test('duplicate username surfaces "Username is already in use."', async () => {
    // seedUser('dupname') creates username `udupname<suffix>`, which we collide with below
    await seedUser('dupname')
    const username = `udupname${suffix}`.slice(0, 15)
    const email = `freshname-${suffix}@example.com`
    const res = await post('/sign-up', {
      inviteCode: BACKDOOR_INVITE_CODE,
      username,
      email,
      confirmEmail: email,
      password: VALID_PASSWORD,
      confirmPassword: VALID_PASSWORD
    })
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('Username is already in use.')
  })

  test('happy path creates a pending user with exactly one validation token', async () => {
    const email = `happy-${suffix}@example.com`
    const before = emailSpy.mock.calls.length
    const res = await post('/sign-up', {
      inviteCode: BACKDOOR_INVITE_CODE,
      username: `uhappy${suffix}`.slice(0, 15),
      email,
      confirmEmail: email,
      password: VALID_PASSWORD,
      confirmPassword: VALID_PASSWORD
    })
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/sign-in')

    const created = await userByEmail(email)
    expect(created).toBeDefined()
    if (!created) throw new Error('user not created')
    expect(created.status).toBe('pending')
    expect(await tokenCount(created.id)).toBe(1)
    expect(emailSpy.mock.calls.length).toBe(before + 1)
  })

  test('email send failure is non-fatal: the account is still created and we still redirect', async () => {
    const email = `nofatal-${suffix}@example.com`
    emailSpy.mockRejectedValueOnce(new Error('postmark down'))
    const res = await post('/sign-up', {
      inviteCode: BACKDOOR_INVITE_CODE,
      username: `unofatal${suffix}`.slice(0, 15),
      email,
      confirmEmail: email,
      password: VALID_PASSWORD,
      confirmPassword: VALID_PASSWORD
    })
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/sign-in')

    const created = await userByEmail(email)
    expect(created).toBeDefined()
    if (!created) throw new Error('user not created')
    expect(created.status).toBe('pending')
    expect(await tokenCount(created.id)).toBe(1)
  })
})

describe('POST /sign-up invite codes', () => {
  function signUpFields(name: string, inviteCode: string) {
    const email = `${name}-${suffix}@example.com`
    return {
      inviteCode,
      username: `u${name}${suffix}`.slice(0, 15),
      email,
      confirmEmail: email,
      password: VALID_PASSWORD,
      confirmPassword: VALID_PASSWORD
    }
  }

  test('missing invite code re-renders the form with an error and creates no user', async () => {
    const fields = signUpFields('noinvite', '')
    const res = await post('/sign-up', fields)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Invite code is required.')
    expect(await userByEmail(fields.email)).toBeUndefined()
  })

  test('unknown invite code re-renders the form with an error and creates no user', async () => {
    const fields = signUpFields('badinvite', `NOPE${suffix}`.toUpperCase())
    const res = await post('/sign-up', fields)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('That invite code is not valid or has already been used.')
    expect(await userByEmail(fields.email)).toBeUndefined()
  })

  test('backdoor sign-up seeds the new user with fresh invite codes', async () => {
    const fields = signUpFields('backdoor', BACKDOOR_INVITE_CODE)
    const res = await post('/sign-up', fields)
    expect(res.status).toBe(303)

    const created = await userByEmail(fields.email)
    expect(created).toBeDefined()
    if (!created) throw new Error('user not created')
    const codes = await db.selectFrom('inviteCodes').where('createdBy', '=', created.id).select(['code', 'claimedBy']).execute()
    expect(codes.length).toBe(INVITE_CODES_PER_USER)
    expect(codes.every((row) => row.claimedBy === null)).toBe(true)
    // 24 chars from the consonant-only alphabet
    expect(codes.every((row) => /^[QWRTPSDFGHJKLZXCVBNM]{24}$/.test(row.code))).toBe(true)
  })

  test("another user's invite code is claimed and the inviter becomes a favorite", async () => {
    const inviter = await seedUser('inviter')
    const code = `WLINVITE${suffix}`.toUpperCase()
    await db.insertInto('inviteCodes').values({ code, createdBy: inviter.id }).execute()

    const fields = signUpFields('invited', code)
    const res = await post('/sign-up', fields)
    expect(res.status).toBe(303)

    const created = await userByEmail(fields.email)
    expect(created).toBeDefined()
    if (!created) throw new Error('user not created')

    const claimed = await db
      .selectFrom('inviteCodes')
      .where('code', '=', code)
      .select(['claimedBy', 'claimed'])
      .executeTakeFirstOrThrow()
    expect(claimed.claimedBy).toBe(created.id)
    expect(claimed.claimed).not.toBeNull()

    const favorite = await db
      .selectFrom('favorites')
      .where('userId', '=', created.id)
      .where('friendId', '=', inviter.id)
      .select(['id'])
      .executeTakeFirst()
    expect(favorite).toBeDefined()

    // single-use: reusing the claimed code fails and creates no second account
    const reuse = signUpFields('reuse', code)
    const res2 = await post('/sign-up', reuse)
    expect(res2.status).toBe(200)
    expect(await res2.text()).toContain('That invite code is not valid or has already been used.')
    expect(await userByEmail(reuse.email)).toBeUndefined()
  })

  test('a waitlist invite code is claimed on sign-up without adding a favorite', async () => {
    const code = `WLCODE${suffix}`.toUpperCase()
    await db
      .insertInto('waitlist')
      .values({ email: `wl-${suffix}@example.com` })
      .execute()
    await db.updateTable('waitlist').set({ code, sent: new Date() }).where('email', '=', `wl-${suffix}@example.com`).execute()

    const fields = signUpFields('fromwl', code)
    const res = await post('/sign-up', fields)
    expect(res.status).toBe(303)

    const created = await userByEmail(fields.email)
    expect(created).toBeDefined()
    if (!created) throw new Error('user not created')

    const claimed = await db
      .selectFrom('waitlist')
      .where('code', '=', code)
      .select(['claimedBy', 'claimed'])
      .executeTakeFirstOrThrow()
    expect(claimed.claimedBy).toBe(created.id)
    expect(claimed.claimed).not.toBeNull()

    const favorites = await db.selectFrom('favorites').where('userId', '=', created.id).select(['id']).execute()
    expect(favorites.length).toBe(0)

    // single-use: reusing the claimed waitlist code fails
    const reuse = signUpFields('wlreuse', code)
    const res2 = await post('/sign-up', reuse)
    expect(res2.status).toBe(200)
    expect(await res2.text()).toContain('That invite code is not valid or has already been used.')
  })
})

describe('POST /resend-validation', () => {
  test('pending user gets a fresh token and a neutral redirect', async () => {
    const user = await seedUser('resendpending')
    expect(await tokenCount(user.id)).toBe(0)
    const before = emailSpy.mock.calls.length

    const res = await post('/resend-validation', { email: user.email })
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/sign-in')
    expect(await tokenCount(user.id)).toBe(1)
    expect(emailSpy.mock.calls.length).toBe(before + 1)
  })

  test('unknown email returns the same neutral redirect and sends nothing', async () => {
    const before = emailSpy.mock.calls.length
    const res = await post('/resend-validation', { email: `ghost-${suffix}@example.com` })
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/sign-in')
    expect(emailSpy.mock.calls.length).toBe(before)
  })

  test('already-active user returns the same neutral redirect and creates no token', async () => {
    const user = await seedUser('resendactive')
    await setActive(user.id)
    expect(await tokenCount(user.id)).toBe(0)
    const before = emailSpy.mock.calls.length

    const res = await post('/resend-validation', { email: user.email })
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/sign-in')
    expect(await tokenCount(user.id)).toBe(0)
    expect(emailSpy.mock.calls.length).toBe(before)
  })
})
