import { lookup } from 'node:dns/promises'
import net from 'node:net'
import type { ServerType } from '@hono/node-server'
import type { Logger } from 'pino'
import type API from './api'

let shuttingDown = false
export function shutdown(type: 'SIGINT' | 'SIGTERM', server: ServerType, api: API, logger: Logger) {
  if (shuttingDown) {
    logger.warn({ type }, 'Shutdown already in progress, ignoring additional signal')
    return
  }
  shuttingDown = true
  logger.warn({ type }, 'Shutting down server')
  server.close((err) => {
    let status = 0

    api.shutdown().catch((err) => {
      logger.error({ type, error: err }, 'Error shutting down API')
      status = 1
    })

    if (err) {
      if (err instanceof Error) {
        logger.error({ type, error: err, stack: err.stack, message: err.message }, 'Error closing server')
      } else {
        logger.error({ type, error: String(err) }, 'Error closing server')
      }
      status = 1
    }
    logger.info({ type, status }, 'Server shutdown complete')
    process.exit(status)
  })
}

export async function assertPortFree(host: string, port: number, logger: Logger) {
  const addresses = await lookup(host, { all: true })
  for (const { address } of addresses) {
    const inUse = await new Promise<boolean>((resolve) => {
      const socket = net.connect({ host: address, port })
      socket.setTimeout(1000)
      socket.once('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.once('timeout', () => {
        socket.destroy()
        resolve(false)
      })
      socket.once('error', () => resolve(false))
    })
    if (inUse) {
      logger.error({ host, address, port }, 'Port is already in use, exiting')
      process.exit(1)
    }
  }
}
