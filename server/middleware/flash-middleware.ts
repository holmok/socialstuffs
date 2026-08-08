import type { MiddlewareHandler } from 'hono'

type FlashType = 'success' | 'error' | 'info'
export type Flashes = Record<FlashType, string[]>

export type FlashContext = {
  addFlash: (type: FlashType, message: string) => Promise<void>
  getFlashes: () => Promise<Flashes>
}

export function flash(): MiddlewareHandler {
  return async (c, next) => {
    const { session } = c.var
    const flash: FlashContext = {
      async addFlash(type: FlashType, message: string) {
        const flashKey = `flash`
        const flashes = (await session.getSessionValue<Flashes>(flashKey)) ?? { success: [], error: [], info: [] }
        flashes[type] = [...(flashes[type] ?? []), message]
        await session.setSessionValue(flashKey, flashes)
      },
      async getFlashes() {
        // Safe: every addFlash caller redirects immediately (flashes are read on the NEXT request,
        // which carries the session cookie so isNew is false). Do NOT addFlash-then-render in the
        // same request on a brand-new session — this fast path would drop that flash.
        if (session.isNew) return { success: [], error: [], info: [] }
        const flashKey = `flash`
        return (await session.popSessionValue<Flashes>(flashKey)) ?? { success: [], error: [], info: [] }
      }
    }
    c.set('flash', flash)
    return next()
  }
}
