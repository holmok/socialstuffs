import { afterAll, describe, expect, test } from 'bun:test'
import pino from 'pino'
import LoadConfig from '@/config'
import { createApp } from '@/server'

const config = LoadConfig()
const logger = pino({ level: 'silent' })
const { app, db } = createApp(config, logger)

// dev/prod apps for mode-dependent branches (stack traces) — config is overridden per app
// instead of mutating process.env so nothing leaks into other test files
const devConfig: typeof config = { ...config, mode: { isDev: true, isProd: false, env: 'development' } }
const prodConfig: typeof config = { ...config, mode: { isDev: false, isProd: true, env: 'production' } }
const { app: devApp, db: devDb } = createApp(devConfig, logger)
const { app: prodApp, db: prodDb } = createApp(prodConfig, logger)

const throwPath = '/throw-test-endpoint'
devApp.get(throwPath, () => {
  throw new Error('kaboom-dev-stack')
})
prodApp.get(throwPath, () => {
  throw new Error('kaboom-prod-stack')
})

// session ids minted by the 401 flash writes, so we can clean up their kv rows
const sessionIds = new Set<string>()

// signed cookie value is `${sessionId}.${signature}`; session ids are alphanumeric (no dots)
function sessionIdFromResponse(res: Response): string | undefined {
  const set = res.headers.getSetCookie().find((s) => s.startsWith(`${config.auth.sessionCookieName}=`))
  if (!set) return undefined
  return decodeURIComponent(set.split(';')[0].split('=')[1]).split('.')[0]
}

afterAll(async () => {
  for (const sid of sessionIds) {
    await db.deleteFrom('kvStorage').where('key', 'like', `${sid}:%`).execute()
  }
  await db.destroy()
  await devDb.destroy()
  await prodDb.destroy()
})

describe('errorHandler / notFoundHandler HTMX handling', () => {
  test('HTMX request hitting the global error handler does not swap over the form target', async () => {
    const res = await app.request('http://localhost/bogus-endpoint-xyz', {
      headers: { 'HX-Request': 'true', 'HX-Target': 'sign-in-form' }
    })
    const body = await res.text()

    expect(res.status).toBe(404)
    // Reswap:none tells htmx to leave the triggering form (and what the user typed) untouched.
    expect(res.headers.get('HX-Reswap')).toBe('none')
    // The error is delivered out-of-band as a flash, not as a body that replaces the target.
    expect(body).toContain('hx-swap-oob="beforeend:#flash-region"')
    expect(body).toContain('flash-item flash-error')
    expect(body).not.toContain('class="error-fragment"')
  })

  test('non-HTMX request hitting the global error handler still gets the full error page', async () => {
    const res = await app.request('http://localhost/bogus-endpoint-xyz')
    const body = await res.text()

    expect(res.status).toBe(404)
    expect(res.headers.get('HX-Reswap')).toBeNull()
    expect(body).toContain('<html')
    expect(body).toContain('404')
  })

  test('HTMX 401 still redirects to /sign-in and does not set HX-Reswap', async () => {
    const res = await app.request('http://localhost/user', {
      headers: { 'HX-Request': 'true' }
    })

    expect(res.status).toBe(401)
    // GET deep links carry a next param so sign-in can return the user to where they were headed
    expect(res.headers.get('HX-Redirect')).toBe('/sign-in?next=%2Fuser')
    expect(res.headers.get('HX-Reswap')).toBeNull()

    const sid = sessionIdFromResponse(res)
    if (sid) sessionIds.add(sid)
  })

  test('non-HTMX 401 redirects to /sign-in with a plain redirect and no HX headers', async () => {
    const res = await app.request('http://localhost/user')

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/sign-in?next=%2Fuser')
    expect(res.headers.get('HX-Redirect')).toBeNull()
    expect(res.headers.get('HX-Reswap')).toBeNull()

    const sid = sessionIdFromResponse(res)
    if (sid) sessionIds.add(sid)
  })
})

describe('errorHandler 5xx stack traces (dev vs prod)', () => {
  test('development mode includes the stack trace in the full error page', async () => {
    const res = await devApp.request(`http://localhost${throwPath}`)
    const body = await res.text()

    expect(res.status).toBe(500)
    // the css inlines an .error-detail selector in every error page, so assert on the rendered element
    expect(body).toContain('<pre class="error-detail">')
    expect(body).toContain('kaboom-dev-stack')
  })

  test('production mode never includes the stack trace in the full error page', async () => {
    const res = await prodApp.request(`http://localhost${throwPath}`)
    const body = await res.text()

    expect(res.status).toBe(500)
    expect(body).toContain('<html')
    expect(body).not.toContain('<pre class="error-detail">')
    expect(body).not.toContain('kaboom-prod-stack')
  })

  test('HTMX/OOB fragment path never includes the stack trace, even in development', async () => {
    const res = await devApp.request(`http://localhost${throwPath}`, {
      headers: { 'HX-Request': 'true' }
    })
    const body = await res.text()

    expect(res.status).toBe(500)
    expect(res.headers.get('HX-Reswap')).toBe('none')
    expect(body).toContain('flash-item flash-error')
    expect(body).not.toContain('<pre class="error-detail">')
    expect(body).not.toContain('kaboom-dev-stack')
  })
})
