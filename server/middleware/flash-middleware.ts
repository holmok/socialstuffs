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
        const flashKey = `flash`
        const flashes = (await session.getSessionValue<Flashes>(flashKey)) ?? { success: [], error: [], info: [] }
        await session.removeSessionValue(flashKey)
        return flashes
      }
    }
    c.set('flash', flash)
    return next()
  }
}
