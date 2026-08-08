import UserPage from '@pages/user'
import type { Hono } from 'hono'
import type { Logger } from 'pino'
import * as m from '@/middleware'
import * as utils from '@/utils'

export default function UserRoutes(app: Hono, logger: Logger) {
  logger.info('Registering user routes')
  const user = app.basePath('/user')
  user.use('*', m.authorize({ requireAuth: true }))

  user.get('/', async (c) => {
    return c.render(UserPage(), {
      title: 'User',
      description: 'User test page.'
    })
  })

  user.post('/sign-out', async (c) => {
    const { auth, flash } = c.var
    await auth.signOut()
    await flash.addFlash('success', 'You have been signed out.')
    return utils.redirect(c, '/')
  })
}
