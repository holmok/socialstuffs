import { afterAll, beforeAll, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import EmailAPI from '@api/email-api'
import type { UserRole } from '@data/user-data'
import normalizeEmail from 'normalize-email'
import pino from 'pino'
import LoadConfig from '@/config'
import { __resetRateLimits } from '@/middleware'
import { createApp } from '@/server'

const config = LoadConfig()
const logger = pino({ level: 'silent' })
const { app, db } = createApp(config, logger)

const suffix = Math.random().toString(36).slice(2, 10)

const PASSWORD = 'Admin1234!ok'

// stub Postmark so no real emails are sent; also lets us assert what was sent
const emailSpy = spyOn(EmailAPI.prototype, 'sendEmail').mockResolvedValue(undefined)

type SeededUser = { id: number; uid: string; email: string; username: string }

async function seedUser(name: string, role: UserRole = 'user'): Promise<SeededUser> {
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
  // status/role are not insertable; flip via update like the other flow tests
  await db.updateTable('users').set({ status: 'active', role }).where('id', '=', row.id).execute()
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
      'X-Forwarded-For': `10.8.0.${ipCounter}`,
      ...(cookie ? { cookie } : {})
    },
    body: new URLSearchParams(fields).toString()
  })
}

// the waitlist tables post repeated ids fields; URLSearchParams handles the multi-value append
function postIds(path: string, ids: number[], cookie: string) {
  ipCounter += 1
  const body = new URLSearchParams()
  for (const id of ids) body.append('ids', String(id))
  return app.request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: 'http://localhost',
      'X-Forwarded-For': `10.8.1.${ipCounter}`,
      cookie
    },
    body: body.toString()
  })
}

function get(path: string, cookie?: string) {
  return app.request(`http://localhost${path}`, { headers: cookie ? { cookie } : {} })
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

// @example.org by default — admin invite/revoke emails are skipped for @example.com (seed-script
// addresses), so tests asserting a send need a domain outside that filter
async function seedWaitlist(name: string, domain = 'example.org') {
  return await db
    .insertInto('waitlist')
    .values({ email: `${name}-${suffix}@${domain}` })
    .returning(['id', 'email'])
    .executeTakeFirstOrThrow()
}

async function waitlistById(id: number) {
  return await db.selectFrom('waitlist').where('id', '=', id).selectAll().executeTakeFirstOrThrow()
}

let adminUser: SeededUser
let regularUser: SeededUser
let adminCookie: string

beforeAll(async () => {
  adminUser = await seedUser('admin', 'admin')
  regularUser = await seedUser('plain')
  adminCookie = await signIn(adminUser)
})

beforeEach(() => {
  __resetRateLimits()
})

afterAll(async () => {
  await db.deleteFrom('waitlist').where('email', 'like', `%${suffix}%`).execute()
  const ids = [adminUser?.id, regularUser?.id].filter((id): id is number => id != null)
  if (ids.length > 0) {
    await db.deleteFrom('users').where('id', 'in', ids).execute()
  }
  emailSpy.mockRestore()
  await db.destroy()
})

describe('/admin access control', () => {
  test('anonymous requests are redirected to sign-in', async () => {
    const res = await get('/admin')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('/sign-in')
  })

  test('a regular user gets 403', async () => {
    const cookie = await signIn(regularUser)
    const res = await get('/admin', cookie)
    expect(res.status).toBe(403)
  })

  test('an admin sees the dashboard', async () => {
    const res = await get('/admin', adminCookie)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('Admin Dashboard')
    expect(body).toContain('On the Waitlist')
  })
})

describe('/admin/waitlist', () => {
  test('lists people waiting for an invite', async () => {
    const entry = await seedWaitlist('listme')
    const res = await get('/admin/waitlist', adminCookie)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain(entry.email)
  })

  test('send sets code+sent and emails the invite with a prefilled sign-up link', async () => {
    const entry = await seedWaitlist('sendme')
    const before = emailSpy.mock.calls.length

    const res = await postIds('/admin/waitlist/send', [entry.id], adminCookie)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/admin/waitlist')

    const row = await waitlistById(entry.id)
    expect(row.code).not.toBeNull()
    expect(row.sent).not.toBeNull()
    expect(row.claimed).toBeNull()

    expect(emailSpy.mock.calls.length).toBe(before + 1)
    const call = emailSpy.mock.calls[before][0]
    expect(call.to).toBe(entry.email)
    expect(call.template).toBe('waitlist-invite-email')
    expect(call.data?.code).toBe(row.code)
    expect(String(call.data?.url)).toContain(`/sign-up?code=${row.code}`)
  })

  test('send to a seeded @example.com entry sets code+sent but skips the email', async () => {
    const entry = await seedWaitlist('seededsend', 'example.com')
    const before = emailSpy.mock.calls.length

    const res = await postIds('/admin/waitlist/send', [entry.id], adminCookie)
    expect(res.status).toBe(303)

    const row = await waitlistById(entry.id)
    expect(row.code).not.toBeNull()
    expect(row.sent).not.toBeNull()
    expect(emailSpy.mock.calls.length).toBe(before)
  })

  test('sending again for an already-invited row is a no-op', async () => {
    const entry = await seedWaitlist('resendme')
    await postIds('/admin/waitlist/send', [entry.id], adminCookie)
    const first = await waitlistById(entry.id)
    const before = emailSpy.mock.calls.length

    await postIds('/admin/waitlist/send', [entry.id], adminCookie)
    const second = await waitlistById(entry.id)
    expect(second.code).toBe(first.code)
    expect(second.sent?.getTime()).toBe(first.sent?.getTime())
    expect(emailSpy.mock.calls.length).toBe(before)
  })
})

describe('/admin/waitlist-unclaimed', () => {
  test('lists sent-but-unclaimed invites and revoke returns them to the pool', async () => {
    const entry = await seedWaitlist('revokeme')
    await postIds('/admin/waitlist/send', [entry.id], adminCookie)

    const listRes = await get('/admin/waitlist-unclaimed', adminCookie)
    expect(listRes.status).toBe(200)
    expect(await listRes.text()).toContain(entry.email)

    const before = emailSpy.mock.calls.length
    const res = await postIds('/admin/waitlist-unclaimed/revoke', [entry.id], adminCookie)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/admin/waitlist-unclaimed')

    const row = await waitlistById(entry.id)
    expect(row.code).toBeNull()
    expect(row.sent).toBeNull()

    expect(emailSpy.mock.calls.length).toBe(before + 1)
    const call = emailSpy.mock.calls[before][0]
    expect(call.to).toBe(entry.email)
    expect(call.template).toBe('waitlist-revoke-email')
  })

  test('revoking a seeded @example.com invite clears the row but skips the email', async () => {
    const entry = await seedWaitlist('seededrevoke', 'example.com')
    await postIds('/admin/waitlist/send', [entry.id], adminCookie)
    const before = emailSpy.mock.calls.length

    const res = await postIds('/admin/waitlist-unclaimed/revoke', [entry.id], adminCookie)
    expect(res.status).toBe(303)

    const row = await waitlistById(entry.id)
    expect(row.code).toBeNull()
    expect(row.sent).toBeNull()
    expect(emailSpy.mock.calls.length).toBe(before)
  })

  test('a claimed invite cannot be revoked', async () => {
    const entry = await seedWaitlist('claimedone')
    await postIds('/admin/waitlist/send', [entry.id], adminCookie)
    // simulate the claim that sign-up performs
    await db.updateTable('waitlist').set({ claimedBy: adminUser.id, claimed: new Date() }).where('id', '=', entry.id).execute()
    const before = emailSpy.mock.calls.length

    await postIds('/admin/waitlist-unclaimed/revoke', [entry.id], adminCookie)
    const row = await waitlistById(entry.id)
    expect(row.code).not.toBeNull()
    expect(row.sent).not.toBeNull()
    expect(emailSpy.mock.calls.length).toBe(before)
  })
})
