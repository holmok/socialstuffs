import { createHash } from 'node:crypto'
import type { UserData } from '@data/user-data'
import type { MiddlewareHandler } from 'hono'
import * as cookie from 'hono/cookie'
import { HTTPException } from 'hono/http-exception'
import { sign, verify } from 'hono/jwt'

// `pwv` (password version) is a fingerprint of the passwordHash the token was minted against;
// authorize() compares it to the current hash so a password reset revokes all earlier tokens
export type UserContext = Pick<UserData, 'uid' | 'username' | 'status' | 'role'> & { pwv: string }

export function passwordVersion(passwordHash: string): string {
  return createHash('sha256').update(passwordHash).digest('hex').slice(0, 16)
}
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
        const payload = await verify(token, config.auth.jwtSecret, 'HS256')
        userContext = {
          uid: payload.uid as string,
          username: payload.username as string,
          status: payload.status as UserContext['status'],
          role: payload.role as UserContext['role'],
          pwv: payload.pwv as string
        }
      } catch (err) {
        logger.warn({ reason: err instanceof Error ? err.name : 'unknown' }, 'Failed to verify auth token, clearing auth cookie')
        await cookie.setSignedCookie(c, config.auth.userCookieName, '', config.auth.cookieSecret, {
          httpOnly: true,
          sameSite: 'strict',
          secure: config.mode.isProd,
          maxAge: 0
        })
      }
    }
    const auth: AuthContext = {
      user: userContext,
      async setUser(userContext: UserContext) {
        const { uid, username, status, role, pwv } = userContext
        const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
        const token = await sign({ uid, username, status, role, pwv, exp }, config.auth.jwtSecret, 'HS256')
        await cookie.setSignedCookie(c, config.auth.userCookieName, token, config.auth.cookieSecret, {
          httpOnly: true,
          sameSite: 'strict',
          secure: config.mode.isProd,
          maxAge: 60 * 60 * 24 * 7
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
          secure: config.mode.isProd,
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
    const { auth, db, logger } = c.var
    const { user } = auth
    if ((opts.requireAuth || opts.roles) && !user) {
      logger.warn('Unauthorized access attempt to a protected route')
      throw new HTTPException(401, { message: 'Unauthorized' })
    }
    if (user && user.status !== 'active') {
      logger.warn({ user: user.username, status: user.status }, 'Unauthorized access attempt by non-active user')
      throw new HTTPException(401, { message: 'Unauthorized' })
    }
    if (user && (opts.requireAuth || opts.roles)) {
      // re-check the DB so bans/demotions and password resets take effect immediately
      // instead of after the JWT's 7-day exp; claims alone are a sign-in-time snapshot
      const dbUser = await db
        .selectFrom('users')
        .where('uid', '=', user.uid)
        .select(['status', 'role', 'passwordHash'])
        .executeTakeFirst()
      if (dbUser?.status !== 'active' || passwordVersion(dbUser.passwordHash) !== user.pwv) {
        logger.warn({ user: user.username }, 'Stale or revoked credentials, clearing auth cookie')
        await auth.signOut()
        throw new HTTPException(401, { message: 'Unauthorized' })
      }
      if (opts.roles && !opts.roles.includes(dbUser.role)) {
        logger.warn({ user: user.username, role: dbUser.role, roles: opts.roles }, 'Forbidden access based on role')
        throw new HTTPException(403, { message: 'Forbidden' })
      }
    }
    return next()
  }
}
