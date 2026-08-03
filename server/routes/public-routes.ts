import AboutPage from '@pages/about'
import HomePage from '@pages/home'
import ContactPage from '@templates/pages/contact'
import PrivacyPage from '@templates/pages/privacy'
import TermsPage from '@templates/pages/terms'
import type { Hono } from 'hono'
import type { Logger } from 'pino'

export default function PublicRoutes(app: Hono, logger: Logger) {
  logger.info('Registering public routes')

  app.get('/', (c) => {
    return c.render(HomePage(), {
      title: 'Home',
      description: 'A great place to hang out and share your thoughts.',
      styles: ['info']
    })
  })

  app.get('/about', (c) => {
    return c.render(AboutPage(), { title: 'About', description: 'All about socialstuffs.', styles: ['info'] })
  })

  app.get('/contact', (c) => {
    return c.render(ContactPage(), { title: 'Contact Us', description: 'How to contact the team.', styles: ['info'] })
  })

  app.get('/terms', (c) => {
    return c.render(TermsPage(), { title: 'Terms of Service', description: 'Our terms of service.', styles: ['info'] })
  })

  app.get('/privacy', (c) => {
    return c.render(PrivacyPage(), { title: 'Privacy Policy', description: 'Our privacy policy.', styles: ['info'] })
  })
}
