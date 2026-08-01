import { serve } from '@hono/node-server'
import pino from 'pino'
import LoadConfig from '@/config'
import { createApp } from './server'
import * as utils from './utils'

const config = LoadConfig()
const logger = pino(config.pino)

await utils.assertPortFree(config.server.host, config.server.port, logger)

const { app, api } = createApp(config, logger)

const server = serve(
  {
    port: config.server.port,
    fetch: app.fetch,
    hostname: config.server.host
  },
  (info) => {
    logger.info({ port: info.port, host: info.address }, 'Server started')
  }
)

process.on('SIGINT', () => utils.shutdown('SIGINT', server, api, logger))
process.on('SIGTERM', () => utils.shutdown('SIGTERM', server, api, logger))
