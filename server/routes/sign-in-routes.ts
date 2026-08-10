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

  // per-account lockout on top of the per-IP limiter above: counts credential failures against
  // the submitted email across ALL source IPs (kv-backed, survives restarts). Keyed on the
  // submitted address whether or not an account exists, so the response leaks nothing new.
  const acctLimit = m.failureLimit({ windowMs: 15 * 60 * 1000, max: 10, keyPrefix: 'sign-in-acct' })

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
        if (await acctLimit.isBlocked(db, normalizedEmail)) {
          logger.warn('Per-account sign-in failure limit exceeded')
          c.status(429)
          return c.html(SignInForm({ ...data, errors: { form: ['Too many attempts. Please try again later.'] } }))
        }

        const user = await db.selectFrom('users').where('normalizedEmail', '=', normalizedEmail).selectAll().executeTakeFirst()

        if (!user) {
          await Bun.password.verify(data.password, DUMMY_HASH, 'bcrypt')
          await acctLimit.recordFailure(db, normalizedEmail)
          logger.warn('User not found for sign-in')
          return c.html(SignInForm({ ...data, errors: { form: ['Invalid sign in.'] } }))
        }

        const isPasswordValid = await Bun.password.verify(data.password, user.passwordHash, 'bcrypt')

        if (!isPasswordValid) {
          await acctLimit.recordFailure(db, normalizedEmail)
          logger.warn({ userId: user.id }, 'Invalid password for sign-in')
          return c.html(SignInForm({ ...data, errors: { form: ['Invalid sign in.'] } }))
        }

        if (user.status === 'pending') {
          // correct password — a stuck-mid-validation user retrying is not a credential failure
          logger.warn({ userId: user.id }, 'Sign-in attempt for pending account')
          return c.html(
            SignInForm({
              ...data,
              errors: { form: ['Please validate your email address before signing in. Need a new link? Use "Resend it" below.'] }
            })
          )
        }

        if (user.status !== 'active') {
          await acctLimit.recordFailure(db, normalizedEmail)
          logger.warn({ userId: user.id, status: user.status }, 'Sign-in attempt for non-active account')
          return c.html(SignInForm({ ...data, errors: { form: ['Invalid sign in.'] } }))
        }

        await acctLimit.clear(db, normalizedEmail)

        await auth.setUser({
          uid: user.uid,
          username: user.username,
          role: user.role,
          status: user.status,
          pwv: m.passwordVersion(user.passwordHash)
        })

        logger.info({ userId: user.id }, 'User signed in successfully')

        await flash.addFlash('success', 'You have signed in successfully.')
        return utils.redirect(c, '/')
      } catch (error) {
        utils.logError(logger, error, 'Error during sign-in')
        return c.html(SignInForm({ ...data, errors: { form: ['An unexpected error occurred. Please try again later.'] } }))
      }
    }
  })
}
