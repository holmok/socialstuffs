import { afterAll, describe, expect, test } from 'bun:test'
import { csrfProtect } from '@middleware/csrf-middleware'
import { Hono } from 'hono'
import { csrf } from 'hono/csrf'
import pino from 'pino'
import LoadConfig from '@/config'
import { createApp } from '@/server'

const config = LoadConfig()
const logger = pino({ level: 'silent' })
const { app, db } = createApp(config, logger)

afterAll(async () => {
  await db.destroy()
})

describe('info pages', () => {
  const pages: [string, string][] = [
    ['/about', 'Remember when sharing was just sharing?'],
    ['/contact', 'Contact Us'],
    ['/terms', 'Terms of Service'],
    ['/privacy', 'Privacy Policy']
  ]

  for (const [path, title] of pages) {
    test(`GET ${path} returns 200 with its title`, async () => {
      const res = await app.request(`http://localhost${path}`)
      expect(res.status).toBe(200)
      const body = await res.text()
      expect(body).toContain(title)
    })
  }
})

describe('CSRF rejection', () => {
  test('a cross-origin form POST gets the styled 403 error page, not a bare fragment', async () => {
    const res = await app.request('http://localhost/sign-in', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: 'http://evil.example'
      },
      body: new URLSearchParams({ email: 'a@example.com', password: 'x' }).toString()
    })
    expect(res.status).toBe(403)
    const body = await res.text()
    // full styled page: layout chrome plus the error page markup, not hono's bare "Forbidden"
    expect(body).toContain('<!DOCTYPE html>')
    expect(body).toContain('<style>')
    expect(body).toContain('class="error-page"')
    expect(body).toContain('class="status-code"')
    expect(body).toContain('403')
  })

  // csrfProtect wraps hono's stock csrf() as a probe; this matrix pins that the allow/deny
  // decision is identical to the stock middleware for every interesting header combination,
  // so a hono upgrade that changes csrf semantics fails here instead of silently diverging.
  describe('matches stock csrf() allow/deny decisions', () => {
    const form = 'application/x-www-form-urlencoded'
    const cases: [string, { method: string; headers?: Record<string, string> }, 'allow' | 'deny'][] = [
      ['GET without origin', { method: 'GET' }, 'allow'],
      ['HEAD without origin', { method: 'HEAD' }, 'allow'],
      [
        'form POST with same-origin Origin',
        { method: 'POST', headers: { 'Content-Type': form, Origin: 'http://localhost' } },
        'allow'
      ],
      [
        'form POST with cross-origin Origin',
        { method: 'POST', headers: { 'Content-Type': form, Origin: 'http://evil.example' } },
        'deny'
      ],
      ['form POST with no Origin at all', { method: 'POST', headers: { 'Content-Type': form } }, 'deny'],
      ['POST with no Content-Type header (treated as text/plain)', { method: 'POST' }, 'deny'],
      [
        'form POST with Sec-Fetch-Site: same-origin and no Origin',
        { method: 'POST', headers: { 'Content-Type': form, 'Sec-Fetch-Site': 'same-origin' } },
        'allow'
      ],
      [
        'form POST with Sec-Fetch-Site: cross-site and no Origin',
        { method: 'POST', headers: { 'Content-Type': form, 'Sec-Fetch-Site': 'cross-site' } },
        'deny'
      ],
      [
        'JSON POST with no Origin (not a form content-type)',
        { method: 'POST', headers: { 'Content-Type': 'application/json' } },
        'allow'
      ],
      [
        'HTMX form POST with same-origin Origin',
        { method: 'POST', headers: { 'Content-Type': form, Origin: 'http://localhost', 'HX-Request': 'true' } },
        'allow'
      ]
    ]

    const stock = new Hono()
    stock.use(csrf())
    stock.all('/probe', (c) => c.text('ok'))

    const wrapped = new Hono()
    wrapped.use(async (c, next) => {
      c.set('logger', { warn: () => {} } as never)
      await next()
    })
    wrapped.use(csrfProtect())
    wrapped.all('/probe', (c) => c.text('ok'))

    for (const [name, init, verdict] of cases) {
      test(`${name} -> ${verdict}`, async () => {
        const body = init.method === 'GET' || init.method === 'HEAD' ? undefined : 'a=1'
        const stockRes = await stock.request('http://localhost/probe', { ...init, body })
        const wrappedRes = await wrapped.request('http://localhost/probe', { ...init, body })
        const stockAllowed = stockRes.status === 200
        const wrappedAllowed = wrappedRes.status === 200
        expect(stockAllowed).toBe(verdict === 'allow')
        expect(wrappedAllowed).toBe(stockAllowed)
        if (!wrappedAllowed) expect(wrappedRes.status).toBe(403)
      })
    }
  })
})
