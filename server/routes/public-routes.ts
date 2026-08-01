import Card from '@components/card'
import AboutPage from '@pages/about'
import HomePage from '@pages/home'
import SignInPage from '@pages/sign-in'
import SignUpPage from '@pages/sign-up'
import type { Hono } from 'hono'
import type { Logger } from 'pino'

export default function PublicRoutes(app: Hono, logger: Logger) {
  logger.info('Registering public routes')

  app.get('/', (c) => {
    return c.html(HomePage({ description: 'A server-rendered starter app built with Bun, Hono, and HTMX.' }))
  })

  app.get('/about', (c) => {
    return c.html(AboutPage({ description: 'About the Bun + Hono + HTMX starter app.' }))
  })

  app.get('/sign-in', (c) => {
    return c.html(SignInPage({ description: 'Sign in to the Bun + Hono + HTMX starter app.' }))
  })

  app.get('/sign-up', (c) => {
    return c.html(SignUpPage({ description: 'Create an account for the Bun + Hono + HTMX starter app.' }))
  })

  app.get('/clicked', (c) => {
    return c.html(Card('You clicked the button!'))
  })
}
