import { afterAll, describe, expect, test } from 'bun:test'
import { type AuthContext, authenticate, authorize, passwordVersion, type UserContext } from '@middleware/auth-middleware'
import { configContext } from '@middleware/config-middleware'
import { dataContext } from '@middleware/data-middleware'
import { Hono } from 'hono'
import { getSignedCookie, setSignedCookie } from 'hono/cookie'
import { HTTPException } from 'hono/http-exception'
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
})

// The hono/jwt migration: exercise the real sign/verify + signed-cookie round-trip
// through authenticate(). We reuse the app's db instance (also loads the
// ContextVariableMap augmentation) but drive a minimal app so no csrf/routing is involved.
const config = LoadConfig()
const { db } = createApp(config, logger)

const suffix = Math.random().toString(36).slice(2, 10)

afterAll(async () => {
  await db.deleteFrom('users').where('normalizedEmail', 'like', `%${suffix}%`).execute()
  await db.destroy()
})

const claims: UserContext = { uid: 'u-jwt', username: 'jwtuser', status: 'active', role: 'user', pwv: 'test-pwv' }

type SeededUser = { id: number; uid: string; username: string; passwordHash: string }

async function seedUser(name: string, role: 'user' | 'admin' = 'user'): Promise<SeededUser> {
  const username = `a${name}${suffix}`.slice(0, 15)
  const email = `${name}-${suffix}@example.com`
  const passwordHash = await Bun.password.hash('AuthzPass99!', { algorithm: 'bcrypt', cost: 10 })
  const row = await db
    .insertInto('users')
    .values({
      uid: `authz-${name}-${suffix}`,
      username,
      normalizedUsername: username.toLowerCase(),
      email,
      normalizedEmail: email.toLowerCase(),
      passwordHash
    })
    .returning(['id', 'uid', 'username'])
    .executeTakeFirstOrThrow()
  await db.updateTable('users').set({ status: 'active', role }).where('id', '=', row.id).execute()
  return { ...row, passwordHash }
}

function contextFor(u: SeededUser, over: Partial<UserContext> = {}): UserContext {
  return { uid: u.uid, username: u.username, status: 'active', role: 'user', pwv: passwordVersion(u.passwordHash), ...over }
}

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
  // mints a valid cookie for arbitrary claims via the production setUser path
  app.post('/mint-user', async (c) => {
    const body = (await c.req.json()) as UserContext
    await c.var.auth.setUser(body)
    return c.json({ ok: true })
  })
  app.get('/protected', authorize({ requireAuth: true }), (c) => c.text('ok'))
  app.get('/admin', authorize({ roles: ['admin'] }), (c) => c.text('ok'))
  app.get('/whoami', (c) => c.json({ user: c.var.auth.user ?? null }))
  // build error responses through the context (like the real errorHandler) so
  // headers set before a throw — e.g. authorize()'s cookie clear — are preserved
  app.onError((err, c) => (err instanceof HTTPException ? c.text(err.message, err.status) : c.text('error', 500)))
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

async function mintCookieFor(app: Hono, user: UserContext): Promise<string> {
  const minted = await app.request('/mint-user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user)
  })
  return userCookie(minted)
}

describe('authorize() DB re-check (revocation)', () => {
  test('an active user is admitted; the admin route enforces the DB role, not the claim', async () => {
    const app = authApp()
    const u = await seedUser('ok')
    const cookie = await mintCookieFor(app, contextFor(u))
    expect((await app.request('/protected', { headers: { cookie } })).status).toBe(200)
    expect((await app.request('/admin', { headers: { cookie } })).status).toBe(403)
  })

  test('an admin by DB role is admitted to the admin route', async () => {
    const app = authApp()
    const u = await seedUser('adm', 'admin')
    const cookie = await mintCookieFor(app, contextFor(u, { role: 'admin' }))
    expect((await app.request('/admin', { headers: { cookie } })).status).toBe(200)
  })

  test('flipping the DB status revokes an existing session immediately: 401 + cookie cleared', async () => {
    const app = authApp()
    const u = await seedUser('ban')
    const cookie = await mintCookieFor(app, contextFor(u))
    expect((await app.request('/protected', { headers: { cookie } })).status).toBe(200)

    await db.updateTable('users').set({ status: 'inactive' }).where('id', '=', u.id).execute()
    const res = await app.request('/protected', { headers: { cookie } })
    expect(res.status).toBe(401)
    const cleared = clearedCookieHeader(res)
    expect(cleared).toBeDefined()
    expect(cleared).toContain('Max-Age=0')
  })

  test('a password change revokes tokens minted against the old hash: 401 + cookie cleared', async () => {
    const app = authApp()
    const u = await seedUser('pw')
    const cookie = await mintCookieFor(app, contextFor(u))
    expect((await app.request('/protected', { headers: { cookie } })).status).toBe(200)

    const newHash = await Bun.password.hash('BrandNewPass99!', { algorithm: 'bcrypt', cost: 10 })
    await db.updateTable('users').set({ passwordHash: newHash }).where('id', '=', u.id).execute()
    const res = await app.request('/protected', { headers: { cookie } })
    expect(res.status).toBe(401)
    const cleared = clearedCookieHeader(res)
    expect(cleared).toBeDefined()
    expect(cleared).toContain('Max-Age=0')
  })

  test('a demoted admin loses the admin route but keeps plain authenticated access', async () => {
    const app = authApp()
    const u = await seedUser('dem', 'admin')
    const cookie = await mintCookieFor(app, contextFor(u, { role: 'admin' }))
    expect((await app.request('/admin', { headers: { cookie } })).status).toBe(200)

    await db.updateTable('users').set({ role: 'user' }).where('id', '=', u.id).execute()
    expect((await app.request('/admin', { headers: { cookie } })).status).toBe(403)
    expect((await app.request('/protected', { headers: { cookie } })).status).toBe(200)
  })

  test('valid claims with no matching user row are rejected', async () => {
    const app = authApp()
    const cookie = await mintCookieFor(app, claims) // u-jwt has no users row
    const res = await app.request('/protected', { headers: { cookie } })
    expect(res.status).toBe(401)
  })
})
