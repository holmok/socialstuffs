import type { MiddlewareHandler } from 'hono'
import type { Config } from '@/config'

// Versioned assets (e.g. htmx.min.2.0.10.js) get a filename bump on every change,
// so they are safe to cache immutably for a year. Everything else changes in place
// under a stable name, so it gets a moderate TTL and relies on ETag revalidation.
const VERSIONED = /\.\d+\.\d+\.\d+\.[a-z]+$/

const IMMUTABLE = 'public, max-age=31536000, immutable'
const MODERATE = 'public, max-age=86400'

export function staticCache(config: Config): MiddlewareHandler {
  return async (c, next) => {
    await next()
    if (c.res.status === 200 || c.res.status === 304) {
      const cacheControl = config.mode.isProd ? (VERSIONED.test(c.req.path) ? IMMUTABLE : MODERATE) : 'no-store'
      c.res.headers.set('Cache-Control', cacheControl)
    }
  }
}
