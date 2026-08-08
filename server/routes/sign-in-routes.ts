import SignInPage from '@pages/sign-in'
import SignInForm from '@templates/components/sign-in-form'
import type { Hono } from 'hono'
import normalizeEmail from 'normalize-email'
import type { Logger } from 'pino'
import { z } from 'zod'
import * as m from '@/middleware'
import * as utils from '@/utils'

// verified against when no user matches, so sign-in takes the same time whether or not the email exists
const DUMMY_HASH = await Bun.password.hash('dummy-password-for-timing', { algorithm: 'bcrypt', cost: 10 })

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

  const signInLimit = m.rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    keyPrefix: 'sign-in',
    onLimit: (c) => c.html(SignInForm({ errors: { form: ['Too many attempts. Please try again later.'] } }))
  })

  app.post('/sign-in', signInLimit, async (c) => {
    const formData = await c.req.formData()
    const form = Object.fromEntries(formData.entries()) as Record<string, string>
    const result = utils.validateFormData<SignInData>(form, signInSchema)

    if (!result.success) {
      c.var.logger.warn({ errors: result.errors }, 'Validation errors on sign-in form')
      return c.html(SignInForm({ ...form, errors: result.errors }))
    } else {
      const { data } = result
      const { db, logger, auth, flash } = c.var

      const normalizedEmail = normalizeEmail(data.email)

      try {
        const user = await db.selectFrom('users').where('normalizedEmail', '=', normalizedEmail).selectAll().executeTakeFirst()

        if (!user) {
          await Bun.password.verify(data.password, DUMMY_HASH, 'bcrypt')
          logger.warn({ normalizedEmail }, 'User not found for sign-in')
          return c.html(SignInForm({ ...data, errors: { form: ['Invalid sign in.'] } }))
        }

        const isPasswordValid = await Bun.password.verify(data.password, user.passwordHash, 'bcrypt')

        if (!isPasswordValid) {
          logger.warn({ userId: user.id }, 'Invalid password for sign-in')
          return c.html(SignInForm({ ...data, errors: { form: ['Invalid sign in.'] } }))
        }

        if (user.status === 'pending') {
          logger.warn({ userId: user.id }, 'Sign-in attempt for pending account')
          return c.html(SignInForm({ ...data, errors: { form: ['Please validate your email address before signing in.'] } }))
        }

        if (user.status !== 'active') {
          logger.warn({ userId: user.id, status: user.status }, 'Sign-in attempt for non-active account')
          return c.html(SignInForm({ ...data, errors: { form: ['Invalid sign in.'] } }))
        }

        await auth.setUser({
          uid: user.uid,
          username: user.username,
          role: user.role,
          status: user.status,
          pwv: m.passwordVersion(user.passwordHash)
        })

        logger.info({ userId: user.id }, 'User signed in successfully')

        await flash.addFlash('success', 'You have signed in successfully.')
        return utils.redirect(c, '/user')
      } catch (error) {
        utils.logError(logger, error, 'Error during sign-in')
        return c.html(SignInForm({ ...data, errors: { form: ['An unexpected error occurred. Please try again later.'] } }))
      }
    }
  })
}
