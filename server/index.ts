import pino from 'pino'
import LoadConfig from '@/config'
import { createApp } from './server'
import * as utils from './utils'

const config = LoadConfig()

// In dev, config.pino sets a pino-pretty `transport`; pino ignores any passed stream when a
// transport is configured, so dev must construct with the options alone (no multistream).
// In prod there is no transport, so we fan out to an async stdout destination plus the Axiom
// transport stream — each entry needs an explicit level or it defaults to 'info' and drops debug.
let logger: pino.Logger
if (config.mode.isProd) {
  const axiomStream = pino.transport({
    target: '@axiomhq/pino',
    options: {
      dataset: config.axiom.dataset,
      token: config.axiom.token,
      edge: 'us-east-1.aws.edge.axiom.co'
    }
  })
  const streams: pino.StreamEntry[] = [
    { level: config.logLevel, stream: pino.destination({ dest: 1, sync: false }) },
    { level: config.logLevel, stream: axiomStream }
  ]
  logger = pino(config.pino, pino.multistream(streams))
} else {
  logger = pino(config.pino)
}

const { app, db } = createApp(config, logger)

let server: ReturnType<typeof Bun.serve>
try {
  server = Bun.serve({
    port: config.server.port,
    fetch: app.fetch,
    hostname: config.server.host,
    // image uploads cap at 20MB and formData() buffers the whole body before that check runs,
    // so bound the body here instead of Bun's 128MB default (20MB + multipart overhead)
    maxRequestBodySize: 25 * 1024 * 1024
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
