import type { style } from '@styles/index'
import Layout from '@templates/layouts/main-layout'
import type { MiddlewareHandler } from 'hono'
import { jsxRenderer, useRequestContext } from 'hono/jsx-renderer'

declare module 'hono' {
  interface ContextRenderer {
    // biome-ignore lint/style/useShorthandFunctionType: declaration merging requires a call signature
    (content: string | Promise<string>, props: { title: string; description: string; styles?: style[] }): Response
  }
}

export function layoutContext(): MiddlewareHandler {
  return jsxRenderer(
    async ({ children, title, description, styles }) => {
      const c = useRequestContext()
      const flashes = await c.var.flash.getFlashes()
      const user = c.var.auth.user
      const isAuthenticated = !!user
      return (
        <Layout title={title} description={description} styles={styles} flashes={flashes} isAuthenticated={isAuthenticated}>
          {children}
        </Layout>
      )
    },
    { docType: true }
  )
}
