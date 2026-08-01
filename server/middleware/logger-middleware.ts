import type { MiddlewareHandler } from 'hono'
import { pinoLogger } from 'hono-pino'
import type { Logger } from 'pino'

export function loggerContext(logger: Logger): MiddlewareHandler {
  return pinoLogger({
    pino: logger
  })
}
