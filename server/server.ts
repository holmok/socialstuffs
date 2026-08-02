import data from '@data/index'
import * as m from '@middleware/index'
import Routes from '@routes/index'
import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { compress } from 'hono/compress'
import type { Logger } from 'pino'
import type { Config } from '@/config'

declare module 'hono' {
  interface ContextVariableMap {
    db: ReturnType<typeof data>
    logger: Logger
    config: Config
  }
}

export function createApp(config: Config, logger: Logger) {
  logger.info('Creating Hono app')

  const db = data(config.poolConfig, config.dbSchema, logger)
  const app = new Hono()

  app.use(m.configContext(config))
  app.use(m.loggerContext(logger))
  app.use(m.dataContext(db))
  app.use(compress())

  Routes(app, logger)
  app.use('/*', m.staticCache(config))
  app.use('/*', serveStatic({ root: './static' }))
  return { app, db }
}
