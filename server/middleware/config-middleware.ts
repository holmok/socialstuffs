import type { MiddlewareHandler } from 'hono'
import type { Config } from '@/config'

export function configContext(config: Config): MiddlewareHandler {
  return async (c, next) => {
    c.set('config', config)
    await next()
  }
}
