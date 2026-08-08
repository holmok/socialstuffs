import Flash from '@components/flash'
import Footer from '@components/footer'
import Header from '@components/header'
import getStyle, { type style } from '@styles/index'
import type { FC, PropsWithChildren } from 'hono/jsx'
import type { Flashes } from '@/middleware/flash-middleware'

interface LayoutProps {
  title: string
  description: string
  styles?: style[]
  flashes?: Flashes
  isAuthenticated: boolean
}

const Layout: FC<PropsWithChildren<LayoutProps>> = (props) => {
  const { children, title, description, styles, flashes, isAuthenticated } = props
  const styleList = new Set<style>(['reset', 'global', ...(styles || [])])
  const styleString = getStyle(Array.from(styleList))
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content={description} />
        <meta name="htmx-config" content={'{"responseHandling":[{"code":"204","swap":false},{"code":"...","swap":true}]}'} />
        <title>socialstuffs / {title}</title>
        <style dangerouslySetInnerHTML={{ __html: styleString }}></style>
        <script src="/js/htmx.min.js" defer></script>
        <script src="/js/nav.js" defer></script>
        <script src="/js/flash.js" defer></script>
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="manifest" href="/site.webmanifest" />
      </head>
      <body id="top">
        <Header isAuthenticated={isAuthenticated} />
        {flashes && <Flash flashes={flashes} />}
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  )
}

export default Layout
