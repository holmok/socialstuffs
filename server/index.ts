import pino from 'pino'
import LoadConfig from '@/config'
import { createApp } from './server'
import * as utils from './utils'

const config = LoadConfig()

let streams: pino.StreamEntry[] = [{ stream: process.stdout }]
if (config.mode.isProd) {
  const axiomStream = pino.transport({
    target: '@axiomhq/pino',
    options: {
      dataset: config.axiom.dataset,
      token: config.axiom.token,
      edge: 'us-east-1.aws.edge.axiom.co'
    }
  })
  streams = [{ stream: process.stdout }, { stream: axiomStream }]
}

const logger = pino(config.pino, pino.multistream(streams))

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
