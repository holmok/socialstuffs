import API from '@api/index'
import { serveStatic } from '@hono/node-server/serve-static'
import * as m from '@middleware/index'
import Routes from '@routes/index'
import { Hono } from 'hono'
import type { Logger } from 'pino'
import type { Config } from '@/config'

declare module 'hono' {
  interface ContextVariableMap {
    api: API
    logger: Logger
    config: Config
  }
}

export function createApp(config: Config, logger: Logger) {
  const api = new API(config, logger)
  const app = new Hono()

  app.use(m.configContext(config))
  app.use(m.loggerContext(logger))
  app.use(m.apiContext(api))

  Routes(app, logger)
  app.use('/*', m.staticCache(config))
  app.use('/*', serveStatic({ root: './static' }))
  return { app, api }
}
