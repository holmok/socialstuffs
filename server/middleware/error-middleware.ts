import ErrorOobFragment from '@components/error-oob-fragment'
import ErrorPage from '@pages/error'
import type { Context, ErrorHandler, NotFoundHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

function isHtmxRequest(c: Context) {
  return c.req.header('HX-Request') === 'true'
}

function renderError(c: Context, status: ContentfulStatusCode, message?: string, detail?: string) {
  if (isHtmxRequest(c)) {
    // Suppress the target swap so the triggering form (and what the user typed) survives,
    // and surface the error out-of-band as a flash message instead of a form-replacing body.
    c.header('HX-Reswap', 'none')
    return c.html(ErrorOobFragment({ status, message }), status)
  }
  c.status(status)
  return c.render(ErrorPage({ status, message, detail }), {
    title: `Error ${status}`,
    description: 'Something went wrong.',
    styles: ['info', 'error']
  })
}

export function notFoundHandler(): NotFoundHandler {
  return (c) => {
    c.var.logger.info({ path: c.req.path }, 'Not found')
    return renderError(c, 404)
  }
}

export function errorHandler(): ErrorHandler {
  return async (err, c) => {
    const { logger, config, flash } = c.var
    if (err instanceof HTTPException && err.status < 500) {
      if (err.status === 401) {
        await flash.addFlash('error', 'You must be signed in to access that page.')
        // carry the deep link through sign-in so the user lands back where they were headed (GETs only —
        // replaying a POST target as a GET after sign-in would 404 or worse)
        let signInPath = '/sign-in'
        if (c.req.method === 'GET') {
          const url = new URL(c.req.url)
          signInPath = `/sign-in?next=${encodeURIComponent(url.pathname + url.search)}`
        }
        if (isHtmxRequest(c)) {
          c.header('HX-Redirect', signInPath)
          return c.body(null, 401)
        }
        return c.redirect(signInPath)
      }
      logger.warn({ status: err.status, path: c.req.path, msg: err.message }, 'Request error')
      return renderError(c, err.status as ContentfulStatusCode, err.message)
    }
    logger.error({ err, path: c.req.path }, 'Server error')
    const status = err instanceof HTTPException ? err.status : 500
    return renderError(c, status as ContentfulStatusCode, undefined, config.mode.isDev ? (err.stack ?? String(err)) : undefined)
  }
}
