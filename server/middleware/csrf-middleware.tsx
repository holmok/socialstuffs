import ErrorPage from '@pages/error'
import Layout from '@templates/layouts/main-layout'
import type { MiddlewareHandler } from 'hono'
import { csrf } from 'hono/csrf'

// hono's csrf() signals rejection by throwing an HTTPException(403) with a bare "Forbidden" Response.
// This middleware runs before the layout renderer (deliberately — forged cross-origin posts shouldn't
// touch auth/session), so letting that exception reach the error handler renders an unstyled fragment.
// Instead, run the check against a no-op next: hono's csrf only invokes next once the request passes,
// so an un-called probe means rejection and we render the styled error page (same chrome as
// error-middleware's full-page path) directly. Only then does the real chain continue.
export function csrfProtect(): MiddlewareHandler {
  const check = csrf()
  return async (c, next) => {
    let allowed = false
    try {
      await check(c, async () => {
        allowed = true
      })
    } catch {
      allowed = false
    }
    if (!allowed) {
      c.var.logger.warn({ path: c.req.path }, 'CSRF rejected')
      const page = (
        <Layout title="Error 403" description="Something went wrong." styles={['info', 'error']} isAuthenticated={false}>
          <ErrorPage status={403} />
        </Layout>
      ).toString()
      const body = typeof page === 'string' ? page : await page
      return c.html(`<!DOCTYPE html>${body}`, 403)
    }
    await next()
  }
}
