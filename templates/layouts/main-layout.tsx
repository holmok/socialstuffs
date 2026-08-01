import Navigation from '@components/navigation'
import getStyle, { type style } from '@styles/index'
import { raw } from 'hono/html'
import type { FC, PropsWithChildren } from 'hono/jsx'

interface LayoutProps {
  title: string
  styles?: style[]
}

const Layout: FC<PropsWithChildren<LayoutProps>> = (props) => {
  const { children, title, styles } = props
  const styleList = new Set<style>(['reset', 'global', ...(styles || [])])
  const styleString = getStyle(Array.from(styleList))
  return (
    <>
      {raw('<!DOCTYPE html>')}
      <html lang="en">
        <head>
          <meta charSet="UTF-8" />
          <title>Bun + Hono + HTMX / {title}</title>
          <style>{styleString}</style>
          <script src="/js/htmx.min.js"></script>
          <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
          <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
          <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
          <link rel="manifest" href="/site.webmanifest" />
        </head>
        <body>
          <Navigation />
          <main>{children}</main>
        </body>
      </html>
    </>
  )
}

export default Layout
