import { afterAll, describe, expect, test } from 'bun:test'
import { configContext } from '@middleware/config-middleware'
import { dataContext } from '@middleware/data-middleware'
import { session } from '@middleware/session-middleware'
import { Hono } from 'hono'
import pino from 'pino'
import LoadConfig from '@/config'
import { createApp } from '@/server'

const config = LoadConfig()
const logger = pino({ level: 'silent' })
// reuse the app's db instance (also loads the ContextVariableMap augmentation)
const { db } = createApp(config, logger)

const suffix = Math.random().toString(36).slice(2, 10)
const kvKey = `sesstest-${suffix}`

// session ids minted during the tests, so we can clean up their kv rows
const sessionIds = new Set<string>()

const app = new Hono()
app.use('*', configContext(config))
app.use('*', dataContext(db))
app.use('*', session())

app.get('/info', (c) => c.json({ sessionId: c.var.session.sessionId, isNew: c.var.session.isNew }))
app.get('/roundtrip', async (c) => {
  await c.var.session.setSessionValue(kvKey, { n: 42 })
  const value = await c.var.session.getSessionValue<{ n: number }>(kvKey)
  return c.json({ value: value ?? null, sessionId: c.var.session.sessionId })
})
app.get('/get-expired', async (c) => {
  const value = await c.var.session.getSessionValue<{ n: number }>(kvKey)
  return c.json({ value: value ?? null, sessionId: c.var.session.sessionId })
})
app.get('/pop-expired', async (c) => {
  const value = await c.var.session.popSessionValue<{ n: number }>(kvKey)
  return c.json({ value: value ?? null, sessionId: c.var.session.sessionId })
})
app.get('/rotate', async (c) => {
  const s = c.var.session
  const oldId = s.sessionId
  await s.setSessionValue(kvKey, 'pre-rotation-secret')
  await s.rotate()
  // read AFTER rotating: pre-rotation values must not follow the new id
  const leaked = await s.getSessionValue<string>(kvKey)
  return c.json({ oldId, newId: s.sessionId, leaked: leaked ?? null })
})

function sessionCookies(res: Response): string[] {
  return res.headers
    .getSetCookie()
    .filter((s) => s.startsWith(`${config.auth.sessionCookieName}=`))
    .map((s) => s.split(';')[0])
}

// signed cookie value is `${sessionId}.${signature}`; session ids are alphanumeric (no dots)
function sessionIdFromCookie(cookie: string): string {
  return decodeURIComponent(cookie.split('=')[1]).split('.')[0]
}

afterAll(async () => {
  for (const sid of sessionIds) {
    await db.deleteFrom('kvStorage').where('key', 'like', `${sid}:%`).execute()
  }
  await db.destroy()
})

describe('session cookie minting', () => {
  test('a new visit mints a signed session cookie that round-trips on the next request', async () => {
    const res1 = await app.request('/info')
    const body1 = (await res1.json()) as { sessionId: string; isNew: boolean }
    sessionIds.add(body1.sessionId)
    expect(body1.isNew).toBe(true)

    const [cookie] = sessionCookies(res1)
    expect(cookie).toBeDefined()
    // signed value: id plus a signature segment
    expect(sessionIdFromCookie(cookie)).toBe(body1.sessionId)
    expect(decodeURIComponent(cookie.split('=')[1])).toContain('.')

    // the cookie verifies on the next request: same id, no re-mint
    const res2 = await app.request('/info', { headers: { cookie } })
    const body2 = (await res2.json()) as { sessionId: string; isNew: boolean }
    expect(body2.isNew).toBe(false)
    expect(body2.sessionId).toBe(body1.sessionId)
    expect(sessionCookies(res2)).toHaveLength(0)
  })
})

describe('session values', () => {
  test('set then get round-trips', async () => {
    const res = await app.request('/roundtrip')
    const body = (await res.json()) as { value: { n: number } | null; sessionId: string }
    sessionIds.add(body.sessionId)
    expect(body.value).toEqual({ n: 42 })
  })

  test('getSessionValue on an expired row returns undefined and deletes the row', async () => {
    const mint = await app.request('/info')
    const { sessionId } = (await mint.json()) as { sessionId: string }
    sessionIds.add(sessionId)
    const [cookie] = sessionCookies(mint)

    const rowKey = `${sessionId}:${kvKey}`
    await db
      .insertInto('kvStorage')
      .values({ key: rowKey, value: JSON.stringify({ n: 1 }), expires: new Date(Date.now() - 1000) })
      .execute()

    const res = await app.request('/get-expired', { headers: { cookie } })
    const body = (await res.json()) as { value: { n: number } | null }
    expect(body.value).toBeNull()
    expect(await db.selectFrom('kvStorage').where('key', '=', rowKey).select('key').executeTakeFirst()).toBeUndefined()
  })

  test('popSessionValue honors expiry: an expired row is not returned', async () => {
    const mint = await app.request('/info')
    const { sessionId } = (await mint.json()) as { sessionId: string }
    sessionIds.add(sessionId)
    const [cookie] = sessionCookies(mint)

    const rowKey = `${sessionId}:${kvKey}`
    await db
      .insertInto('kvStorage')
      .values({ key: rowKey, value: JSON.stringify({ n: 2 }), expires: new Date(Date.now() - 1000) })
      .execute()

    const res = await app.request('/pop-expired', { headers: { cookie } })
    const body = (await res.json()) as { value: { n: number } | null }
    expect(body.value).toBeNull()
  })
})

describe('session rotation', () => {
  test('rotate() mints a new id, sets a new cookie, and drops the old session without leaking values', async () => {
    const res = await app.request('/rotate')
    const body = (await res.json()) as { oldId: string; newId: string; leaked: string | null }
    sessionIds.add(body.oldId)
    sessionIds.add(body.newId)

    expect(body.newId).not.toBe(body.oldId)
    // the value written before rotation is unreadable afterwards
    expect(body.leaked).toBeNull()
    // the old session's kv rows are gone
    const oldRows = await db.selectFrom('kvStorage').where('key', 'like', `${body.oldId}:%`).select('key').execute()
    expect(oldRows).toHaveLength(0)

    // the response's final session cookie carries the rotated id and works on the next request
    const cookies = sessionCookies(res)
    const last = cookies[cookies.length - 1]
    expect(sessionIdFromCookie(last)).toBe(body.newId)
    const res2 = await app.request('/info', { headers: { cookie: last } })
    const body2 = (await res2.json()) as { sessionId: string; isNew: boolean }
    expect(body2.isNew).toBe(false)
    expect(body2.sessionId).toBe(body.newId)
  })
})
