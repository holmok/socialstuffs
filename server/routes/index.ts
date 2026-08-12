import type { Hono } from 'hono'
import type { Logger } from 'pino'
import AdminRoutes from './admin-routes'
import DiscoverRoutes from './discover-routes'
import PostRoutes from './post-routes'
import ProfileRoutes from './profile-routes'
import PublicRoutes from './public-routes'
import RecoverPasswordRoutes from './recover-password-routes'
import SignInRoutes from './sign-in-routes'
import SignUpRoutes from './sign-up-routes'
import UserRoutes from './user-routes'
import WaitlistRoutes from './waitlist-routes'

export default function Routes(app: Hono, logger: Logger) {
  logger.info('Registering routes')
  PublicRoutes(app, logger)
  SignInRoutes(app, logger)
  SignUpRoutes(app, logger)
  RecoverPasswordRoutes(app, logger)
  WaitlistRoutes(app, logger)
  ProfileRoutes(app, logger)
  PostRoutes(app, logger)
  DiscoverRoutes(app, logger)
  UserRoutes(app, logger)
  AdminRoutes(app, logger)
}
