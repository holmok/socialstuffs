import Card from '@components/card'
import AboutPage from '@pages/about'
import HomePage from '@pages/home'
import type { Hono } from 'hono'
import type { Logger } from 'pino'

export default function PublicRoutes(app: Hono, logger: Logger) {
  logger.info('Registering public routes')

  app.get('/', (c) => {
    return c.html(HomePage())
  })

  app.get('/about', (c) => {
    return c.html(AboutPage())
  })

  app.get('/clicked', (c) => {
    return c.html(Card('You clicked the button!'))
  })
}
