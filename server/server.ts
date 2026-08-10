import API from '@api/index'
import data from '@data/index'
import type { AuthContext } from '@middleware/auth-middleware'
import type { FlashContext } from '@middleware/flash-middleware'
import * as m from '@middleware/index'
import type { SessionContext } from '@middleware/session-middleware'
import Routes from '@routes/index'
import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { compress } from 'hono/compress'
import { csrf } from 'hono/csrf'
import { etag } from 'hono/etag'
import { secureHeaders } from 'hono/secure-headers'
import type { PinoLogger } from 'hono-pino'
import type { Logger } from 'pino'
import type { Config } from '@/config'

declare module 'hono' {
  interface ContextVariableMap {
    db: ReturnType<typeof data>
    auth: AuthContext
    api: API
    logger: PinoLogger
    config: Config
    session: SessionContext
    flash: FlashContext
  }
}

export function createApp(config: Config, logger: Logger) {
  logger.info('Creating Hono app')

  const db = data(config.poolConfig, config.dbSchema, logger)
  const api = new API(db, logger, config)
  const app = new Hono()

  app.use(m.configContext(config))
  app.use(m.loggerContext(logger))
  app.use(m.dataContext(db))
  app.use(m.apiContext(api))
  app.use(compress())
  app.use(
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        // the image bucket origin for stored profile photos; blob: for the client-side upload preview
        imgSrc: ["'self'", 'data:', 'blob:', new URL(config.baseImageUrl).origin],
        frameAncestors: ["'none'"]
      },
      xFrameOptions: 'DENY',
      // hono's default already sends HSTS (180 days); pin it explicitly at a year
      strictTransportSecurity: 'max-age=31536000; includeSubDomains'
    })
  )
  app.use('/js/*', m.staticCache(config), etag(), serveStatic({ root: './static' }))
  app.on(
    'GET',
    [
      '/favicon.ico',
      '/favicon-16x16.png',
      '/favicon-32x32.png',
      '/apple-touch-icon.png',
      '/android-chrome-192x192.png',
      '/android-chrome-512x512.png',
      '/robots.txt',
      '/site.webmanifest'
    ],
    m.staticCache(config),
    etag(),
    serveStatic({ root: './static' })
  )
  app.use(csrf())
  app.use(m.authenticate())
  app.use(m.session())
  app.use(m.flash())
  app.use(m.layoutContext())

  Routes(app, logger)

  app.notFound(m.notFoundHandler())
  app.onError(m.errorHandler())
  return { app, db }
}
