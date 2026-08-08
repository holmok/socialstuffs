import type { UserData } from '@data/user-data'
import type { MiddlewareHandler } from 'hono'
import * as cookie from 'hono/cookie'
import { HTTPException } from 'hono/http-exception'
import jwt from 'jsonwebtoken'

export type UserContext = Pick<UserData, 'uid' | 'username' | 'status' | 'role'>
type User = Omit<UserData, 'passwordHash' | 'normalizedUsername' | 'normalizedEmail'>
export type AuthContext = {
  user: UserContext | undefined
  getUser: () => Promise<User | undefined>
  setUser: (userContext: UserContext) => Promise<void>
  signOut: () => Promise<void>
}

function mapUserToUser(user: UserData): User {
  return {
    id: user.id,
    uid: user.uid,
    email: user.email,
    username: user.username,
    created: user.created,
    updated: user.updated,
    status: user.status,
    role: user.role,
    info: user.info,
    preferences: user.preferences,
    lastLogin: user.lastLogin
  }
}

export function authenticate(): MiddlewareHandler {
  return async (c, next) => {
    const { db, config, logger } = c.var
    const token = await cookie.getSignedCookie(c, config.auth.cookieSecret, config.auth.userCookieName)
    let userContext: UserContext | undefined
    if (token) {
      try {
        userContext = jwt.verify(token, config.auth.jwtSecret, { algorithms: ['HS256'] }) as UserContext
      } catch (err) {
        logger.warn({ reason: err instanceof Error ? err.name : 'unknown' }, 'Failed to verify auth token, clearing auth cookie')
        await cookie.setSignedCookie(c, config.auth.userCookieName, '', config.auth.cookieSecret, {
          httpOnly: true,
          sameSite: 'strict',
          maxAge: 0
        })
      }
    }
    const auth: AuthContext = {
      user: userContext,
      async setUser(userContext: UserContext) {
        const token = jwt.sign(userContext, config.auth.jwtSecret)
        await cookie.setSignedCookie(c, config.auth.userCookieName, token, config.auth.cookieSecret, {
          httpOnly: true,
          sameSite: 'strict'
        })
      },
      async getUser() {
        if (!userContext) return undefined
        const user = await db.selectFrom('users').where('uid', '=', userContext.uid).selectAll().executeTakeFirst()
        return user ? mapUserToUser(user) : undefined
      },
      async signOut() {
        await cookie.setSignedCookie(c, config.auth.userCookieName, '', config.auth.cookieSecret, {
          httpOnly: true,
          sameSite: 'strict',
          maxAge: 0
        })
      }
    }
    c.set('auth', auth)
    return next()
  }
}

type AuthorizeOptions = {
  roles?: string[]
  requireAuth?: boolean
}

export function authorize(opts: AuthorizeOptions): MiddlewareHandler {
  return async (c, next) => {
    const { auth, logger } = c.var
    const { user } = auth
    if (opts.requireAuth && !user) {
      logger.warn('Unauthorized access attempt to a protected route')
      throw new HTTPException(401, { message: 'Unauthorized' })
    }
    if (user && user.status !== 'active') {
      logger.warn({ user: user.username, status: user.status }, 'Unauthorized access attempt by non-active user')
      throw new HTTPException(401, { message: 'Unauthorized' })
    }
    if (opts.roles && user && !opts.roles.includes(user.role)) {
      logger.warn({ user: user.username, role: user.role, roles: opts.roles }, 'Forbidden access based on role')
      throw new HTTPException(403, { message: 'Forbidden' })
    }
    return next()
  }
}
