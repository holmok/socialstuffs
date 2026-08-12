import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import pino from 'pino'
import LoadConfig from '@/config'
import { __resetRateLimits } from '@/middleware'
import { createApp } from '@/server'

const config = LoadConfig()
const logger = pino({ level: 'silent' })
const { app, db } = createApp(config, logger)

const suffix = Math.random().toString(36).slice(2, 10)

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
      'X-Forwarded-For': `10.7.0.${ipCounter}`
    },
    body: new URLSearchParams(fields).toString()
  })
}

async function waitlistRows(email: string) {
  return await db.selectFrom('waitlist').where('email', '=', email).selectAll().execute()
}

beforeEach(() => {
  __resetRateLimits()
})

afterAll(async () => {
  await db.deleteFrom('waitlist').where('email', 'like', `%${suffix}%`).execute()
  await db.destroy()
})

describe('GET /waitlist', () => {
  test('renders the join form', async () => {
    const res = await app.request('http://localhost/waitlist')
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('hx-post="/waitlist"')
    expect(body).toContain('Join the Waitlist')
  })
})

describe('POST /waitlist', () => {
  test('valid email joins the waitlist and redirects to the thank-you variant', async () => {
    const email = `join-${suffix}@example.com`
    const res = await post('/waitlist', { email })
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/waitlist?joined=1')

    const rows = await waitlistRows(email)
    expect(rows.length).toBe(1)
    expect(rows[0].sent).toBeNull()
    expect(rows[0].code).toBeNull()
    expect(rows[0].claimed).toBeNull()
  })

  test('duplicate email is a silent no-op with the same success response', async () => {
    const email = `dupe-${suffix}@example.com`
    await post('/waitlist', { email })
    const res = await post('/waitlist', { email })
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/waitlist?joined=1')
    expect((await waitlistRows(email)).length).toBe(1)
  })

  test('email is lowercased so casing variants collapse onto one row', async () => {
    const email = `case-${suffix}@example.com`
    await post('/waitlist', { email: email.toUpperCase() })
    const res = await post('/waitlist', { email })
    expect(res.status).toBe(303)
    expect((await waitlistRows(email)).length).toBe(1)
  })

  test('an HTMX submit swaps the form for the thank-you fragment in place', async () => {
    ipCounter += 1
    const email = `htmx-${suffix}@example.com`
    const res = await app.request('http://localhost/waitlist', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: 'http://localhost',
        'X-Forwarded-For': `10.7.1.${ipCounter}`,
        'HX-Request': 'true'
      },
      body: new URLSearchParams({ email }).toString()
    })
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('Thank you!')
    expect(body).not.toContain('hx-post="/waitlist"')
    expect((await waitlistRows(email)).length).toBe(1)
  })

  test('the joined variant of the page shows the thank-you instead of the form', async () => {
    const res = await app.request('http://localhost/waitlist?joined=1')
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('Thank you!')
    expect(body).not.toContain('hx-post="/waitlist"')
  })

  test('invalid email re-renders the form with an error', async () => {
    const res = await post('/waitlist', { email: 'not-an-email' })
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('hx-post="/waitlist"')
    expect(body).toContain('class="errors"')
  })
})
