import { afterAll, describe, expect, test } from 'bun:test'
import { configContext } from '@middleware/config-middleware'
import { dataContext } from '@middleware/data-middleware'
import { flash } from '@middleware/flash-middleware'
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

function sessionCookie(res: Response): string {
  const set = res.headers.getSetCookie()
  const target = set.find((s) => s.startsWith(`${config.auth.sessionCookieName}=`))
  if (!target) throw new Error('no session cookie set')
  return target.split(';')[0]
}

afterAll(async () => {
  for (const sid of sessionIds) {
    await db.deleteFrom('kvStorage').where('key', 'like', `${sid}:%`).execute()
  }
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
