import type data from '@data/index'
import type { MiddlewareHandler } from 'hono'

export function dataContext(db: ReturnType<typeof data>): MiddlewareHandler {
  return (c, next) => {
    c.set('db', db)
    return next()
  }
}
