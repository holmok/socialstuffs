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
  streams = [{ stream: pino.destination({ dest: 1, sync: false }) }, { stream: axiomStream }]
}

const logger = pino(config.pino, pino.multistream(streams))

const { app, db } = createApp(config, logger)

let server: ReturnType<typeof Bun.serve>
try {
  server = Bun.serve({
    port: config.server.port,
    fetch: app.fetch,
    hostname: config.server.host
  })
} catch (err) {
  utils.logError(logger, err, `Failed to start server on ${config.server.host}:${config.server.port}`)
  process.exit(1)
}

logger.info({ port: server.port, host: server.hostname }, 'Server started')

// Expired kvStorage rows are only removed when their exact key is read again; sweep hourly so
// abandoned sessions' rows don't accumulate forever. unref() keeps it from blocking process exit.
const sweepInterval = setInterval(() => utils.sweepExpiredKv(db, logger), 60 * 60 * 1000)
sweepInterval.unref()

process.on('SIGINT', () => utils.shutdown('SIGINT', server, db, logger, sweepInterval))
process.on('SIGTERM', () => utils.shutdown('SIGTERM', server, db, logger, sweepInterval))
