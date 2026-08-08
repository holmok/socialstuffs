import { lookup } from 'node:dns/promises'
import net from 'node:net'
import type data from '@data/index'
import type { Server } from 'bun'
import type { Context } from 'hono'
import type { Logger } from 'pino'
import type { z } from 'zod'

export function redirect(c: Context, path: string) {
  const isHtmx = c.req.header('HX-Request') === 'true'
  if (isHtmx) {
    c.header('HX-Redirect', path)
    return c.body(null, 204)
  } else {
    return c.redirect(path, 303)
  }
}

export function logError(logger: Logger, error: unknown, message: string) {
  const errorMessage = error instanceof Error ? error.message : String(error)
  const errorStack = error instanceof Error ? error.stack : undefined
  logger.error({ error: errorMessage, stack: errorStack }, message)
}

let shuttingDown = false
export function shutdown(type: 'SIGINT' | 'SIGTERM', server: Server<undefined>, db: ReturnType<typeof data>, logger: Logger) {
  if (shuttingDown) {
    logger.warn({ type }, 'Shutdown already in progress, ignoring additional signal')
    return
  }
  shuttingDown = true
  logger.warn({ type }, 'Shutting down server')
  server
    .stop()
    .then(() => {
      logger.info({ type }, 'Closing database connection')
      return db.destroy()
    })
    .then(() => {
      logger.info({ type }, 'Database connection closed')
      logger.info({ type, status: 0 }, 'Server shutdown complete')
      process.exit(0)
    })
    .catch((err: unknown) => {
      if (err instanceof Error) {
        logger.error({ type, error: err, stack: err.stack, message: err.message }, 'Error during shutdown')
      } else {
        logger.error({ type, error: String(err) }, 'Error during shutdown')
      }
      process.exit(1)
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

export type ValidateFormResult<T> =
  | { success: true; data: T; errors: Partial<Record<keyof T, string[]>> }
  | { success: false; data: Record<string, unknown>; errors: Partial<Record<keyof T, string[]>> }

export function validateFormData<T>(data: Record<string, unknown>, schema: z.ZodType<T>): ValidateFormResult<T> {
  const result = schema.safeParse(data)
  if (!result.success) {
    const errors: Partial<Record<keyof T, string[]>> = {}
    result.error.issues.forEach((err) => {
      const key = err.path[0] as keyof T
      const messages = errors[key] ?? []
      messages.push(err.message)
      errors[key] = messages
    })
    return { success: false, data, errors }
  }
  return { success: true, data: result.data, errors: {} }
}
