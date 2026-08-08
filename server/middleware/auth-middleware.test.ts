import { describe, expect, test } from 'bun:test'
import { type AuthContext, authorize, type UserContext } from '@middleware/auth-middleware'
import { Hono } from 'hono'
import type { PinoLogger } from 'hono-pino'
import pino from 'pino'

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
