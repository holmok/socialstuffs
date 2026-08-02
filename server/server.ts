import API from '@api/index'
import data from '@data/index'
import * as m from '@middleware/index'
import Routes from '@routes/index'
import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { compress } from 'hono/compress'
import type { Logger } from 'pino'
import type { Config } from '@/config'
import type { AuthContext } from '@/middleware/auth-middleware'

declare module 'hono' {
  interface ContextVariableMap {
    db: ReturnType<typeof data>
    auth: AuthContext
    api: API
    logger: Logger
    config: Config
  }
}

export function createApp(config: Config, logger: Logger) {
  logger.info('Creating Hono app')

  const db = data(config.poolConfig, config.dbSchema, logger)
  const api = new API(logger, config)
  const app = new Hono()

  app.use(m.configContext(config))
  app.use(m.loggerContext(logger))
  app.use(m.dataContext(db))
  app.use(m.apiContext(api))
  app.use(m.authenticate())
  app.use(compress())

  Routes(app, logger)
  app.use('/*', m.staticCache(config))
  app.use('/*', serveStatic({ root: './static' }))
  return { app, db }
}
