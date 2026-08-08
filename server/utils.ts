import type data from '@data/index'
import type { Server } from 'bun'
import type { Context } from 'hono'
import type { PinoLogger } from 'hono-pino'
import type { Logger } from 'pino'
import { z } from 'zod'

export function redirect(c: Context, path: string) {
  const isHtmx = c.req.header('HX-Request') === 'true'
  if (isHtmx) {
    c.header('HX-Redirect', path)
    return c.body(null, 204)
  } else {
    return c.redirect(path, 303)
  }
}

export function logError(logger: Logger | PinoLogger, error: unknown, message: string) {
  const errorMessage = error instanceof Error ? error.message : String(error)
  const errorStack = error instanceof Error ? error.stack : undefined
  logger.error({ error: errorMessage, stack: errorStack }, message)
}

export async function sweepExpiredKv(db: ReturnType<typeof data>, logger: Logger) {
  try {
    const result = await db.deleteFrom('kvStorage').where('expires', '<', new Date()).execute()
    const deleted = result.reduce((sum, r) => sum + Number(r.numDeletedRows), 0)
    logger.debug({ deleted }, 'Swept expired kvStorage rows')
  } catch (err) {
    logError(logger, err, 'Failed to sweep expired kvStorage rows')
  }
}

// server.stop() waits for in-flight/keep-alive connections indefinitely; a lingering connection
// can otherwise stall SIGTERM until the supervisor SIGKILLs (skipping db.destroy()). Race the
// graceful stop against a deadline that force-closes connections, then proceed regardless.
const SHUTDOWN_DEADLINE_MS = 10000
function stopServer(type: 'SIGINT' | 'SIGTERM', server: Server<undefined>, logger: Logger): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const forceClose = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      logger.warn({ type, deadlineMs: SHUTDOWN_DEADLINE_MS }, 'Graceful stop timed out, force-closing connections')
      server.stop(true).finally(() => resolve())
    }, SHUTDOWN_DEADLINE_MS)
  })
  return Promise.race([server.stop(), forceClose]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

let shuttingDown = false
export async function shutdown(
  type: 'SIGINT' | 'SIGTERM',
  server: Server<undefined>,
  db: ReturnType<typeof data>,
  logger: Logger,
  sweepInterval: ReturnType<typeof setInterval>
) {
  if (shuttingDown) {
    logger.warn({ type }, 'Shutdown already in progress, ignoring additional signal')
    return
  }
  shuttingDown = true
  logger.warn({ type }, 'Shutting down server')
  clearInterval(sweepInterval)
  try {
    await stopServer(type, server, logger)
    logger.info({ type }, 'Closing database connection')
    await db.destroy()
    logger.info({ type }, 'Database connection closed')
    logger.info({ type, status: 0 }, 'Server shutdown complete')
    process.exit(0)
  } catch (err) {
    if (err instanceof Error) {
      logger.error({ type, error: err, stack: err.stack, message: err.message }, 'Error during shutdown')
    } else {
      logger.error({ type, error: String(err) }, 'Error during shutdown')
    }
    process.exit(1)
  }
}

export type ValidateFormResult<T> =
  | { success: true; data: T; errors: Partial<Record<keyof T, string[]>> }
  | { success: false; data: Record<string, unknown>; errors: Partial<Record<keyof T, string[]>> }

export function validateFormData<T>(data: Record<string, unknown>, schema: z.ZodType<T>): ValidateFormResult<T> {
  const result = schema.safeParse(data)
  if (!result.success) {
    const { fieldErrors } = z.flattenError(result.error)
    return { success: false, data, errors: fieldErrors }
  }
  return { success: true, data: result.data, errors: {} }
}
