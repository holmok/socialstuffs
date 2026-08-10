import type data from '@data/index'
import type { Database } from '@data/index'
import type { UserProfileInfo } from '@data/user-data'
import type { style } from '@styles/index'
import type { Server } from 'bun'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { PinoLogger } from 'hono-pino'
import type { ExpressionBuilder } from 'kysely'
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

// form-error responses branch like redirect(): HTMX submits get the swap fragment, plain (no-JS)
// submits get the full page via the layout renderer so the error page isn't a bare unstyled fragment.
// `meta` mirrors the c.render call of the page's GET handler (title/description/styles)
export function formErrorResponse(
  c: Context,
  fragment: string | Promise<string>,
  page: string | Promise<string>,
  meta: { title: string; description: string; styles?: style[] },
  status?: ContentfulStatusCode
) {
  if (status) c.status(status)
  if (c.req.header('HX-Request') === 'true') return c.html(fragment)
  return c.render(page, meta)
}

// string fields of a form body; tolerates an unparseable/missing body (e.g. a rate-limited bare POST)
export async function formStrings(c: Context): Promise<Record<string, string>> {
  try {
    const formData = await c.req.formData()
    const values: Record<string, string> = {}
    for (const [key, value] of formData.entries()) {
      if (typeof value === 'string') values[key] = value
    }
    return values
  } catch {
    return {}
  }
}

// posts shown per page on the home feed and profile pages
export const POSTS_PER_PAGE = 5

// 48-hour validity shared by account-validation and password-recovery tokens
export const TOKEN_TTL_MS = 48 * 60 * 60 * 1000

// users without an uploaded photo get the shared placeholder image from the bucket
export function displayImageUrl(info: UserProfileInfo, baseImageUrl: string) {
  const base = baseImageUrl.endsWith('/') ? baseImageUrl : `${baseImageUrl}/`
  return info.profileImageUrl ?? new URL('profile.jpg', base).href
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

// shared field rules so sign-up and settings enforce the same username/email constraints
export const usernameSchema = z
  .string()
  .min(1, 'Username is required.')
  .max(15, 'Username must be at most 15 characters long.')
  .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores.')
  .regex(/^[^_]/, 'Username cannot start with an underscore.')
  .regex(/[^_]$/, 'Username cannot end with an underscore.')
  .regex(/^[^0-9]/, 'Username cannot start with a number.')

// single definition shared by sign-up and settings so their uniqueness checks can't drift
export function normalizeUsername(username: string) {
  return username.trim().toLowerCase()
}

export const emailSchema = z
  .email({ error: 'Invalid email address' })
  .min(1, 'Email is required.')
  .max(255, 'Email must be at most 255 characters long.')

export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters long.')
  .max(255, 'Password must be at most 255 characters long.')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter.')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter.')
  .regex(/[0-9]/, 'Password must contain at least one number.')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character.')
  .regex(/^[^\s]*$/, 'Password must not contain spaces.')

export function validateFormData<T>(data: Record<string, unknown>, schema: z.ZodType<T>): ValidateFormResult<T> {
  const result = schema.safeParse(data)
  if (!result.success) {
    const { fieldErrors } = z.flattenError(result.error)
    return { success: false, data, errors: fieldErrors }
  }
  return { success: true, data: result.data, errors: {} }
}

// which of an author's posts a viewer may see, judged from the post's audience row: 'all' always;
// 'favorites' when the author favorited the viewer; 'approved' when the author approved the viewer;
// 'non_disapproved' unless the author disapproved the viewer. Posts predating audience rows count
// as 'all' (mirrors the edit form default). Use inside a query that left-joins postTargets to posts.
export function audienceAllows(eb: ExpressionBuilder<Database, 'posts' | 'postTargets'>, viewerUid: string) {
  return eb.or([
    eb('postTargets.type', 'is', null),
    eb('postTargets.type', '=', 'all'),
    eb.and([
      eb('postTargets.type', '=', 'favorites'),
      eb.exists(
        eb
          .selectFrom('favorites')
          .select('favorites.id')
          .whereRef('favorites.userUid', '=', 'posts.userUid')
          .where('favorites.friendUid', '=', viewerUid)
      )
    ]),
    eb.and([
      eb('postTargets.type', '=', 'approved'),
      eb.exists(
        eb
          .selectFrom('relations')
          .select('relations.id')
          .whereRef('relations.userUid', '=', 'posts.userUid')
          .where('relations.friendUid', '=', viewerUid)
          .where('relations.type', '=', 'approve')
      )
    ]),
    eb.and([
      eb('postTargets.type', '=', 'non_disapproved'),
      eb.not(
        eb.exists(
          eb
            .selectFrom('relations')
            .select('relations.id')
            .whereRef('relations.userUid', '=', 'posts.userUid')
            .where('relations.friendUid', '=', viewerUid)
            .where('relations.type', '=', 'disapprove')
        )
      )
    ])
  ])
}
