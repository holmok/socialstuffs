import pino from 'pino'
import LoadConfig from '@/config'
import { createApp } from './server'
import * as utils from './utils'

const config = LoadConfig()
const logger = pino(config.pino)

await utils.assertPortFree(config.server.host, config.server.port, logger)

const { app, db } = createApp(config, logger)

const server = Bun.serve({
  port: config.server.port,
  fetch: app.fetch,
  hostname: config.server.host
})

logger.info({ port: server.port, host: server.hostname }, 'Server started')

process.on('SIGINT', () => utils.shutdown('SIGINT', server, db, logger))
process.on('SIGTERM', () => utils.shutdown('SIGTERM', server, db, logger))
