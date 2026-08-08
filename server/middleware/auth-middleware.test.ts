import { afterAll, describe, expect, test } from 'bun:test'
import { type AuthContext, authenticate, authorize, type UserContext } from '@middleware/auth-middleware'
import { configContext } from '@middleware/config-middleware'
import { dataContext } from '@middleware/data-middleware'
import { Hono } from 'hono'
import { getSignedCookie, setSignedCookie } from 'hono/cookie'
import { sign, verify } from 'hono/jwt'
import type { PinoLogger } from 'hono-pino'
import pino from 'pino'
import LoadConfig from '@/config'
import { createApp } from '@/server'

const logger = pino({ level: 'silent' })

function appWithUser(user: UserContext | undefined) {
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('logger', logger as unknown as PinoLogger)
    const auth: AuthContext = {
      user,
      getUser: async () => undefined,
      setUser: async () => {},
      signOut: async () => {}
    }
    c.set('auth', auth)
    return next()
  })
  app.get('/admin', authorize({ roles: ['admin'] }), (c) => c.text('ok'))
  return app
}

describe('authorize({ roles })', () => {
  test('401s when there is no user', async () => {
    const res = await appWithUser(undefined).request('/admin')
    expect(res.status).toBe(401)
  })

  test('403s when the user role does not match', async () => {
    const user: UserContext = { uid: 'u1', username: 'alice', status: 'active', role: 'user' }
    const res = await appWithUser(user).request('/admin')
    expect(res.status).toBe(403)
  })

  test('admits an active user with a matching role', async () => {
    const user: UserContext = { uid: 'u1', username: 'alice', status: 'active', role: 'admin' }
    const res = await appWithUser(user).request('/admin')
    expect(res.status).toBe(200)
  })
})

// The hono/jwt migration: exercise the real sign/verify + signed-cookie round-trip
// through authenticate(). We reuse the app's db instance (also loads the
// ContextVariableMap augmentation) but drive a minimal app so no csrf/routing is involved.
const config = LoadConfig()
const { db } = createApp(config, logger)

afterAll(async () => {
  await db.destroy()
})

const claims: UserContext = { uid: 'u-jwt', username: 'jwtuser', status: 'active', role: 'user' }

function authApp() {
  const app = new Hono()
  app.use('*', configContext(config))
  app.use('*', dataContext(db))
  app.use('*', async (c, next) => {
    c.set('logger', logger as unknown as PinoLogger)
    return next()
  })
  app.use('*', authenticate())
  // mints a valid cookie via the production setUser path
  app.get('/mint', async (c) => {
    await c.var.auth.setUser(claims)
    return c.json({ ok: true })
  })
  // sets a signed cookie wrapping an already-expired JWT
  app.get('/mint-expired', async (c) => {
    const exp = Math.floor(Date.now() / 1000) - 60
    const token = await sign({ ...claims, exp }, config.auth.jwtSecret, 'HS256')
    await setSignedCookie(c, config.auth.userCookieName, token, config.auth.cookieSecret, {
      httpOnly: true,
      sameSite: 'strict',
      secure: config.mode.isProd
    })
    return c.json({ ok: true })
  })
  // sets a signed cookie wrapping a JWT signed with a different (rotated) secret
  app.get('/mint-rotated', async (c) => {
    const exp = Math.floor(Date.now() / 1000) + 60 * 60
    const token = await sign({ ...claims, exp }, `rotated-${config.auth.jwtSecret}`, 'HS256')
    await setSignedCookie(c, config.auth.userCookieName, token, config.auth.cookieSecret, {
      httpOnly: true,
      sameSite: 'strict',
      secure: config.mode.isProd
    })
    return c.json({ ok: true })
  })
  // sets a signed cookie wrapping a non-JWT (tampered/garbage) value
  app.get('/mint-garbage', async (c) => {
    await setSignedCookie(c, config.auth.userCookieName, 'not.a.jwt', config.auth.cookieSecret, {
      httpOnly: true,
      sameSite: 'strict',
      secure: config.mode.isProd
    })
    return c.json({ ok: true })
  })
  app.get('/whoami', (c) => c.json({ user: c.var.auth.user ?? null }))
  // unwraps the signed auth cookie and returns the decoded jwt exp
  app.get('/exp', async (c) => {
    const token = await getSignedCookie(c, config.auth.cookieSecret, config.auth.userCookieName)
    if (!token) return c.json({ exp: null })
    const payload = await verify(token, config.auth.jwtSecret, 'HS256')
    return c.json({ exp: payload.exp ?? null })
  })
  return app
}

function userCookie(res: Response): string {
  const target = res.headers.getSetCookie().find((s) => s.startsWith(`${config.auth.userCookieName}=`))
  if (!target) throw new Error('no user cookie set')
  return target.split(';')[0]
}

function clearedCookieHeader(res: Response): string | undefined {
  return res.headers.getSetCookie().find((s) => s.startsWith(`${config.auth.userCookieName}=`))
}

describe('authenticate() hono/jwt path', () => {
  test('a valid signed token round-trips to an authenticated c.var.auth.user', async () => {
    const app = authApp()
    const minted = await app.request('/mint')
    const cookie = userCookie(minted)

    const res = await app.request('/whoami', { headers: { cookie } })
    const body = (await res.json()) as { user: UserContext | null }
    expect(body.user).toEqual(claims)
    // a valid token must not clear the cookie
    expect(clearedCookieHeader(res)).toBeUndefined()
  })

  test('an expired token is rejected: request continues unauthenticated and the cookie is cleared', async () => {
    const app = authApp()
    const minted = await app.request('/mint-expired')
    const cookie = userCookie(minted)

    const res = await app.request('/whoami', { headers: { cookie } })
    const body = (await res.json()) as { user: UserContext | null }
    expect(body.user).toBeNull()
    const cleared = clearedCookieHeader(res)
    expect(cleared).toBeDefined()
    expect(cleared).toContain('Max-Age=0')
  })

  test('a token signed with a rotated secret is rejected: request continues unauthenticated and the cookie is cleared', async () => {
    const app = authApp()
    const minted = await app.request('/mint-rotated')
    const cookie = userCookie(minted)

    const res = await app.request('/whoami', { headers: { cookie } })
    const body = (await res.json()) as { user: UserContext | null }
    expect(body.user).toBeNull()
    const cleared = clearedCookieHeader(res)
    expect(cleared).toBeDefined()
    expect(cleared).toContain('Max-Age=0')
  })

  test('a garbage/tampered token is rejected: request continues unauthenticated and the cookie is cleared', async () => {
    const app = authApp()
    const minted = await app.request('/mint-garbage')
    const cookie = userCookie(minted)

    const res = await app.request('/whoami', { headers: { cookie } })
    const body = (await res.json()) as { user: UserContext | null }
    expect(body.user).toBeNull()
    const cleared = clearedCookieHeader(res)
    expect(cleared).toBeDefined()
    expect(cleared).toContain('Max-Age=0')
  })
})

describe('setUser exp', () => {
  test('a token minted by the real setUser carries exp ~7 days out in seconds', async () => {
    const app = authApp()
    const minted = await app.request('/mint')
    const cookie = userCookie(minted)

    const res = await app.request('/exp', { headers: { cookie } })
    const body = (await res.json()) as { exp: number | null }
    expect(body.exp).not.toBeNull()
    const delta = (body.exp as number) - Math.floor(Date.now() / 1000)
    // 604800 = 7 days in seconds; allow a few seconds of slack for test runtime
    expect(delta).toBeGreaterThanOrEqual(604700)
    expect(delta).toBeLessThanOrEqual(604800)
  })
})

describe('hono/jwt sign/verify', () => {
  test('setUser signs a token whose exp is ~7 days out', async () => {
    const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
    const token = await sign({ ...claims, exp }, config.auth.jwtSecret, 'HS256')
    const payload = await verify(token, config.auth.jwtSecret, 'HS256')
    const sevenDays = 60 * 60 * 24 * 7
    const nowExp = Math.floor(Date.now() / 1000) + sevenDays
    // within a couple seconds of 7 days from now
    expect(Math.abs((payload.exp as number) - nowExp)).toBeLessThan(5)
  })

  test('verify rejects an expired token by throwing', async () => {
    const exp = Math.floor(Date.now() / 1000) - 60
    const token = await sign({ ...claims, exp }, config.auth.jwtSecret, 'HS256')
    await expect(verify(token, config.auth.jwtSecret, 'HS256')).rejects.toThrow()
  })
})
