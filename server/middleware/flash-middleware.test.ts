import { afterAll, describe, expect, test } from 'bun:test'
import { configContext } from '@middleware/config-middleware'
import { dataContext } from '@middleware/data-middleware'
import { flash } from '@middleware/flash-middleware'
import { session } from '@middleware/session-middleware'
import { Hono } from 'hono'
import pino from 'pino'
import LoadConfig from '@/config'
import { createApp } from '@/server'
import { sweepExpiredKv } from '@/utils'

const config = LoadConfig()
const logger = pino({ level: 'silent' })
// reuse the app's db instance (also loads the ContextVariableMap augmentation)
const { db } = createApp(config, logger)

const suffix = Math.random().toString(36).slice(2, 10)
const kvKey = `test-${suffix}`

// session ids minted during the tests, so we can clean up their kv rows
const sessionIds = new Set<string>()

const app = new Hono()
app.use('*', configContext(config))
app.use('*', dataContext(db))
app.use('*', session())
app.use('*', flash())

app.get('/add', async (c) => {
  await c.var.flash.addFlash('success', `hello-${suffix}`)
  return c.json({ sessionId: c.var.session.sessionId })
})
app.get('/get', async (c) => {
  const flashes = await c.var.flash.getFlashes()
  return c.json({ flashes, sessionId: c.var.session.sessionId, isNew: c.var.session.isNew })
})
app.get('/roundtrip', async (c) => {
  await c.var.session.setSessionValue(kvKey, { hi: `there-${suffix}` })
  const value = await c.var.session.getSessionValue<{ hi: string }>(kvKey)
  return c.json({ value, sessionId: c.var.session.sessionId })
})
app.get('/get-expired', async (c) => {
  const value = await c.var.session.getSessionValue<{ x: number }>(`expired-${suffix}`)
  return c.json({ value: value ?? null, sessionId: c.var.session.sessionId })
})
app.get('/add-redirect', async (c) => {
  await c.var.flash.addFlash('info', `redir-${suffix}`)
  return c.redirect('/get', 303)
})

function sessionCookie(res: Response): string {
  const set = res.headers.getSetCookie()
  const target = set.find((s) => s.startsWith(`${config.auth.sessionCookieName}=`))
  if (!target) throw new Error('no session cookie set')
  return target.split(';')[0]
}

// signed cookie value is `${sessionId}.${signature}`; session ids are alphanumeric (no dots)
function sessionIdFromCookie(cookie: string): string {
  return decodeURIComponent(cookie.split('=')[1]).split('.')[0]
}

afterAll(async () => {
  for (const sid of sessionIds) {
    await db.deleteFrom('kvStorage').where('key', 'like', `${sid}:%`).execute()
  }
  await db.deleteFrom('kvStorage').where('key', 'like', `sweeptest-${suffix}:%`).execute()
  await db.destroy()
})

describe('flash getFlashes (atomic pop)', () => {
  test('add then get returns the flash, and a second get is empty', async () => {
    const addRes = await app.request('/add')
    const { sessionId } = (await addRes.json()) as { sessionId: string }
    sessionIds.add(sessionId)
    const cookie = sessionCookie(addRes)

    const firstRes = await app.request('/get', { headers: { cookie } })
    const first = (await firstRes.json()) as { flashes: { success: string[] }; isNew: boolean }
    expect(first.isNew).toBe(false)
    expect(first.flashes.success).toEqual([`hello-${suffix}`])

    const secondRes = await app.request('/get', { headers: { cookie } })
    const second = (await secondRes.json()) as { flashes: { success: string[]; error: string[]; info: string[] } }
    expect(second.flashes).toEqual({ success: [], error: [], info: [] })
  })

  test('get on a request with no session cookie returns empty via the fast path (no kv row)', async () => {
    const res = await app.request('/get')
    const body = (await res.json()) as {
      flashes: { success: string[]; error: string[]; info: string[] }
      sessionId: string
      isNew: boolean
    }
    sessionIds.add(body.sessionId)
    expect(body.isNew).toBe(true)
    expect(body.flashes).toEqual({ success: [], error: [], info: [] })

    // fast path must not have written or read anything for this fresh session
    const rows = await db.selectFrom('kvStorage').where('key', 'like', `${body.sessionId}:%`).selectAll().execute()
    expect(rows).toHaveLength(0)
  })

  test('setSessionValue then getSessionValue round-trips (untouched methods)', async () => {
    const res = await app.request('/roundtrip')
    const body = (await res.json()) as { value: { hi: string } | null; sessionId: string }
    sessionIds.add(body.sessionId)
    expect(body.value).toEqual({ hi: `there-${suffix}` })
  })
})

describe('session/kv expiry', () => {
  test('an expired kvStorage row is treated as absent when read (and deleted)', async () => {
    const mintRes = await app.request('/get')
    const { sessionId } = (await mintRes.json()) as { sessionId: string }
    sessionIds.add(sessionId)
    const cookie = sessionCookie(mintRes)

    const kvRowKey = `${sessionId}:expired-${suffix}`
    await db
      .insertInto('kvStorage')
      .values({ key: kvRowKey, value: JSON.stringify({ x: 1 }), expires: new Date(Date.now() - 1000) })
      .execute()

    const res = await app.request('/get-expired', { headers: { cookie } })
    const body = (await res.json()) as { value: { x: number } | null }
    expect(body.value).toBeNull()

    // the expired row is deleted on read
    const row = await db.selectFrom('kvStorage').where('key', '=', kvRowKey).selectAll().executeTakeFirst()
    expect(row).toBeUndefined()
  })

  test('sweepExpiredKv deletes expired rows and leaves unexpired ones', async () => {
    const oldKey = `sweeptest-${suffix}:old`
    const newKey = `sweeptest-${suffix}:new`
    await db
      .insertInto('kvStorage')
      .values([
        { key: oldKey, value: JSON.stringify('old'), expires: new Date(Date.now() - 1000) },
        { key: newKey, value: JSON.stringify('new'), expires: new Date(Date.now() + 60 * 60 * 1000) }
      ])
      .execute()

    await sweepExpiredKv(db, logger)

    const rows = await db.selectFrom('kvStorage').where('key', 'like', `sweeptest-${suffix}:%`).select('key').execute()
    expect(rows.map((r) => r.key)).toEqual([newKey])
  })
})

describe('flash redirect race', () => {
  test('addFlash on a redirecting request renders exactly once on the next request, gone on the third', async () => {
    const res1 = await app.request('/add-redirect')
    expect(res1.status).toBe(303)
    expect(res1.headers.get('location')).toBe('/get')
    const cookie = sessionCookie(res1)
    sessionIds.add(sessionIdFromCookie(cookie))

    const res2 = await app.request('/get', { headers: { cookie } })
    const second = (await res2.json()) as { flashes: { info: string[] }; isNew: boolean }
    expect(second.isNew).toBe(false)
    expect(second.flashes.info).toEqual([`redir-${suffix}`])

    const res3 = await app.request('/get', { headers: { cookie } })
    const third = (await res3.json()) as { flashes: { success: string[]; error: string[]; info: string[] } }
    expect(third.flashes).toEqual({ success: [], error: [], info: [] })
  })
})

describe('first-visit parallel requests', () => {
  test('two concurrent cookie-less requests both succeed, and an adopted cookie yields a working session', async () => {
    const [resA, resB] = await Promise.all([app.request('/get'), app.request('/get')])
    expect(resA.status).toBe(200)
    expect(resB.status).toBe(200)

    const bodyA = (await resA.json()) as { sessionId: string; isNew: boolean }
    const bodyB = (await resB.json()) as { sessionId: string; isNew: boolean }
    sessionIds.add(bodyA.sessionId)
    sessionIds.add(bodyB.sessionId)
    expect(bodyA.isNew).toBe(true)
    expect(bodyB.isNew).toBe(true)

    // each response minted its own session cookie
    const cookieA = sessionCookie(resA)
    expect(sessionCookie(resB)).not.toBe(cookieA)

    // a client that adopts one of the returned cookies has a working session afterwards
    const addRes = await app.request('/add', { headers: { cookie: cookieA } })
    const added = (await addRes.json()) as { sessionId: string }
    expect(added.sessionId).toBe(bodyA.sessionId)

    const getRes = await app.request('/get', { headers: { cookie: cookieA } })
    const got = (await getRes.json()) as { flashes: { success: string[] }; isNew: boolean }
    expect(got.isNew).toBe(false)
    expect(got.flashes.success).toEqual([`hello-${suffix}`])
  })
})
