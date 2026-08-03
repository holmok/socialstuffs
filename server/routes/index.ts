import type { Hono } from 'hono'
import type { Logger } from 'pino'
import PublicRoutes from './public-routes'
import SignInRoutes from './sign-in-routes'
import SignUpRoutes from './sign-up-routes'

export default function Routes(app: Hono, logger: Logger) {
  logger.info('Registering routes')
  PublicRoutes(app, logger)
  SignInRoutes(app, logger)
  SignUpRoutes(app, logger)
}
