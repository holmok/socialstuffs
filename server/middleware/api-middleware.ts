import type API from '@api/index'
import type { MiddlewareHandler } from 'hono'

export function apiContext(api: API): MiddlewareHandler {
  return (c, next) => {
    c.set('api', api)
    return next()
  }
}
