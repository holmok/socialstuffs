import type { MiddlewareHandler } from 'hono'
import * as cookie from 'hono/cookie'

type FlashType = 'success' | 'error' | 'info'
export type Flashes = Record<FlashType, string[]>

export type FlashContext = {
  addFlash: (type: FlashType, message: string) => Promise<void>
  getFlashes: () => Promise<Flashes>
}

export function flash(): MiddlewareHandler {
  return async (c, next) => {
    const { session, config } = c.var
    // marker cookie: set by addFlash, checked by getFlashes so the common no-flash page render
    // skips the kv DELETE entirely. Plain (unsigned) — worst case a forged marker costs one
    // empty pop. It deliberately survives session.rotate(), so a post-sign-in flash written to
    // the rotated session still pops on the next request.
    const markerName = `${config.auth.sessionCookieName}_f`
    const flash: FlashContext = {
      async addFlash(type: FlashType, message: string) {
        const flashKey = `flash`
        const flashes = (await session.getSessionValue<Flashes>(flashKey)) ?? { success: [], error: [], info: [] }
        flashes[type] = [...(flashes[type] ?? []), message]
        await session.setSessionValue(flashKey, flashes)
        cookie.setCookie(c, markerName, '1', { httpOnly: true, sameSite: 'strict', secure: config.mode.isProd })
      },
      async getFlashes() {
        // Safe: every addFlash caller redirects immediately (flashes are read on the NEXT request,
        // which carries the marker cookie set by addFlash). Do NOT addFlash-then-render in the
        // same request — this fast path only sees markers from the request headers, so it would
        // defer that flash to the next full-page render.
        if (!cookie.getCookie(c, markerName)) return { success: [], error: [], info: [] }
        cookie.deleteCookie(c, markerName)
        const flashKey = `flash`
        return (await session.popSessionValue<Flashes>(flashKey)) ?? { success: [], error: [], info: [] }
      }
    }
    c.set('flash', flash)
    return next()
  }
}
