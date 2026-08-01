import type { MiddlewareHandler } from 'hono'
import type API from '@/api'

export function apiContext(api: API): MiddlewareHandler {
  return (c, next) => {
    c.set('api', api)
    return next()
  }
}
