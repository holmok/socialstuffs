import SignInPage from '@pages/sign-in'
import SignInForm from '@templates/components/sign-in-form'
import type { Hono } from 'hono'
import normalizeEmail from 'normalize-email'
import type { Logger } from 'pino'
import { z } from 'zod'
import * as utils from '@/utils'

const signInSchema = z.object({
  email: z.string().min(1, 'Email is required.').max(255, 'Email must be at most 255 characters long.'),
  password: z.string().min(1, 'Password is required.').max(255, 'Password must be at most 255 characters long.')
})

type SignInData = z.infer<typeof signInSchema>

export default function SignInRoutes(app: Hono, logger: Logger) {
  logger.info('Registering sign-in routes')

  app.get('/sign-in', (c) => {
    return c.render(SignInPage(), { title: 'Sign in', description: 'Sign in to socialstuffs.', styles: ['auth'] })
  })

  app.post('/sign-in', async (c) => {
    const formData = await c.req.formData()
    const form = Object.fromEntries(formData.entries()) as SignInData
    const { data, errors } = utils.validateFormData<SignInData>(form, signInSchema)

    if (Object.keys(errors).length > 0) {
      logger.warn({ errors }, 'Validation errors on sign-in form')
      return c.html(SignInForm({ ...data, errors }))
    } else {
      const { db, logger, auth, flash } = c.var

      const normalizedEmail = normalizeEmail(data.email)

      try {
        const user = await db.selectFrom('users').where('normalizedEmail', '=', normalizedEmail).selectAll().executeTakeFirst()

        if (!user) {
          logger.warn({ normalizedEmail }, 'User not found for sign-in')
          return c.html(SignInForm({ ...data, errors: { form: ['Invalid sign in.'] } }))
        }

        const isPasswordValid = await Bun.password.verify(data.password, user.passwordHash, 'bcrypt')

        if (!isPasswordValid) {
          logger.warn({ userId: user.id }, 'Invalid password for sign-in')
          return c.html(SignInForm({ ...data, errors: { form: ['Invalid sign in.'] } }))
        }

        await auth.setUser({
          uid: user.uid,
          username: user.username,
          role: user.role,
          status: user.status
        })

        logger.info({ userId: user.id }, 'User signed in successfully')

        flash.addFlash('success', 'You have signed in successfully.')
        return utils.redirect(c, '/')
      } catch (error) {
        utils.logError(logger, error, 'Error during sign-in')
        return c.html(SignInForm({ ...data, errors: { form: ['An unexpected error occurred. Please try again later.'] } }))
      }
    }
  })
}
