import type { MiddlewareHandler } from 'hono'
import * as cookie from 'hono/cookie'
import Uniquey from 'uniquey'

export type SessionContext = {
  sessionId: string
  getSessionValue: <T>(key: string) => Promise<T | undefined>
  setSessionValue: <T>(key: string, value: T) => Promise<void>
  removeSessionValue: (key: string) => Promise<void>
}

const uniquey = new Uniquey({ length: 32 })

export function session(): MiddlewareHandler {
  return async (c, next) => {
    const { db, config } = c.var
    let sessionId = await cookie.getSignedCookie(c, config.auth.cookieSecret, config.auth.sessionCookieName)
    if (!sessionId) {
      sessionId = uniquey.create()
      await cookie.setSignedCookie(c, config.auth.sessionCookieName, sessionId, config.auth.cookieSecret, {
        httpOnly: true,
        sameSite: 'strict'
      })
    }
    const session: SessionContext = {
      sessionId,
      async getSessionValue<T>(key: string) {
        const kvKey = `${sessionId}:${key}`
        const data = await db.selectFrom('kvStorage').where('key', '=', kvKey).selectAll().executeTakeFirst()
        if (!data) return undefined
        if (data.expires && new Date(data.expires) < new Date()) {
          await db.deleteFrom('kvStorage').where('key', '=', kvKey).execute()
          return undefined
        }
        return JSON.parse(data.value) as T
      },
      async setSessionValue<T>(key: string, value: T) {
        const kvKey = `${sessionId}:${key}`
        const data = {
          key: kvKey,
          value: JSON.stringify(value),
          expires: new Date(Date.now() + 24 * 60 * 60 * 1000)
        }
        await db
          .insertInto('kvStorage')
          .values(data)
          .onConflict((c) =>
            c.column('key').doUpdateSet({
              value: data.value,
              expires: data.expires
            })
          )
          .execute()
      },
      async removeSessionValue(key: string) {
        const kvKey = `${sessionId}:${key}`
        await db.deleteFrom('kvStorage').where('key', '=', kvKey).execute()
      }
    }
    c.set('session', session)
    return next()
  }
}
