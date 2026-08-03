import ErrorFragment from '@components/error-fragment'
import ErrorPage from '@pages/error'
import type { Context, ErrorHandler, NotFoundHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

function isHtmxRequest(c: Context) {
  return c.req.header('HX-Request') === 'true'
}

function renderError(c: Context, status: ContentfulStatusCode, message?: string, detail?: string) {
  if (isHtmxRequest(c)) {
    return c.html(ErrorFragment({ status, message }), status)
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
  return (err, c) => {
    const { logger, config } = c.var
    if (err instanceof HTTPException && err.status < 500) {
      if (err.status === 401) {
        if (isHtmxRequest(c)) {
          c.header('HX-Redirect', '/sign-in')
          return c.body(null, 401)
        }
        return c.redirect('/sign-in')
      }
      logger.warn({ status: err.status, path: c.req.path, msg: err.message }, 'Request error')
      return renderError(c, err.status as ContentfulStatusCode, err.message)
    }
    logger.error({ err, path: c.req.path }, 'Server error')
    const status = err instanceof HTTPException ? err.status : 500
    return renderError(c, status as ContentfulStatusCode, undefined, config.mode.isDev ? (err.stack ?? String(err)) : undefined)
  }
}
