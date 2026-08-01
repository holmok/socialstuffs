import type { Hono } from 'hono'
import type { Logger } from 'pino'
import PublicRoutes from './public-routes'

export default function Routes(app: Hono, logger: Logger) {
  logger.info('Registering routes')
  PublicRoutes(app, logger)
}
