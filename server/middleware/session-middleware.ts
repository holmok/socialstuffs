import type { MiddlewareHandler } from 'hono'
import * as cookie from 'hono/cookie'
import Uniquey from 'uniquey'

export type SessionContext = {
  sessionId: string
  isNew: boolean
  getSessionValue: <T>(key: string) => Promise<T | undefined>
  popSessionValue: <T>(key: string) => Promise<T | undefined>
  setSessionValue: <T>(key: string, value: T) => Promise<void>
  removeSessionValue: (key: string) => Promise<void>
  rotate: () => Promise<void>
}

const uniquey = new Uniquey({ length: 32 })

export function session(): MiddlewareHandler {
  return async (c, next) => {
    const { db, config } = c.var
    const setSessionCookie = (id: string) =>
      cookie.setSignedCookie(c, config.auth.sessionCookieName, id, config.auth.cookieSecret, {
        httpOnly: true,
        sameSite: 'strict',
        secure: config.mode.isProd
      })
    let sessionId = await cookie.getSignedCookie(c, config.auth.cookieSecret, config.auth.sessionCookieName)
    let isNew = false
    if (!sessionId) {
      isNew = true
      sessionId = uniquey.create()
      await setSessionCookie(sessionId)
    }
    const session: SessionContext = {
      sessionId,
      isNew,
      async getSessionValue<T>(key: string) {
        const kvKey = `${sessionId}:${key}`
        const data = await db.selectFrom('kvStorage').where('key', '=', kvKey).select(['value', 'expires']).executeTakeFirst()
        if (!data) return undefined
        if (data.expires && new Date(data.expires) < new Date()) {
          await db.deleteFrom('kvStorage').where('key', '=', kvKey).execute()
          return undefined
        }
        return JSON.parse(data.value) as T
      },
      async popSessionValue<T>(key: string) {
        const kvKey = `${sessionId}:${key}`
        const data = await db
          .deleteFrom('kvStorage')
          .where('key', '=', kvKey)
          .where('expires', '>', new Date())
          .returning('value')
          .executeTakeFirst()
        if (!data) return undefined
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
      },
      async rotate() {
        // regenerate the session across an auth boundary (sign-in/sign-out) so a pre-auth session id
        // never carries over (session fixation). Drops the old session's kv rows, mints a fresh id,
        // and re-points the cookie — later get/set/pop calls use the new id, so write flashes AFTER
        // rotating or they die with the old session. Minted ids are alphanumeric, but the signed-cookie
        // HMAC covers only the value — a client can replay another cookie signed with the same secret
        // (e.g. the auth JWT, whose base64url alphabet includes `_`) as the session cookie, so escape
        // LIKE metacharacters rather than trusting the id's shape.
        const escaped = session.sessionId.replace(/[\\%_]/g, (ch: string) => `\\${ch}`)
        await db.deleteFrom('kvStorage').where('key', 'like', `${escaped}:%`).execute()
        sessionId = uniquey.create()
        session.sessionId = sessionId
        await setSessionCookie(sessionId)
      }
    }
    c.set('session', session)
    return next()
  }
}
