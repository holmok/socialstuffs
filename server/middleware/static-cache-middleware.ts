import type { MiddlewareHandler } from 'hono'
import type { Config } from '@/config'

export function staticCache(config: Config): MiddlewareHandler {
  const cacheControl = config.mode.isProd ? 'public, max-age=2592000' : 'no-store'
  return async (c, next) => {
    await next()
    if (c.res.status === 200 || c.res.status === 304) {
      c.res.headers.set('Cache-Control', cacheControl)
    }
  }
}
