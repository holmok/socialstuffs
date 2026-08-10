import SignInPage from '@pages/sign-in'
import SignInForm from '@templates/components/sign-in-form'
import type { Context, Hono } from 'hono'
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

// where to land after sign-in: only same-site absolute paths survive — no protocol-relative
// ('//evil.example') or schemed ('https://evil.example') values, so it can't open-redirect
function safeNext(next: string | undefined): string | undefined {
  if (next?.startsWith('/') && !next.startsWith('//') && !next.includes('://')) return next
  return undefined
}

// HTMX failures re-render the form fragment; no-JS failures re-render the full page (mirrors GET /sign-in).
// Only the email is echoed back — the password never is (password inputs don't render values)
function signInError(c: Context, email: string | undefined, errors: Record<string, string[]>, next: string | undefined) {
  const safe = safeNext(next)
  return utils.formErrorResponse(c, SignInForm({ email, next: safe, errors }), SignInPage({ email, next: safe, errors }), {
    title: 'Sign in',
    description: 'Sign in to socialstuffs.',
    styles: ['auth']
  })
}

export default function SignInRoutes(app: Hono, logger: Logger) {
  logger.info('Registering sign-in routes')

  app.get('/sign-in', (c) => {
    return c.render(SignInPage({ next: safeNext(c.req.query('next')) }), {
      title: 'Sign in',
      description: 'Sign in to socialstuffs.',
      styles: ['auth']
    })
  })

  const signInLimit = m.rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    keyPrefix: 'sign-in',
    // echo the typed email back so a 429 doesn't wipe the form (the limiter already set the 429 status)
    onLimit: async (c) => {
      const form = await utils.formStrings(c)
      return signInError(c, form.email, { form: ['Too many attempts. Please try again later.'] }, form.next)
    }
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
      return signInError(c, form.email, result.errors, form.next)
    } else {
      const { data } = result
      const { db, logger, auth, flash } = c.var

      const normalizedEmail = normalizeEmail(data.email)

      try {
        if (await acctLimit.isBlocked(db, normalizedEmail)) {
          logger.warn('Per-account sign-in failure limit exceeded')
          c.status(429)
          return signInError(c, data.email, { form: ['Too many attempts. Please try again later.'] }, form.next)
        }

        const user = await db.selectFrom('users').where('normalizedEmail', '=', normalizedEmail).selectAll().executeTakeFirst()

        if (!user) {
          await Bun.password.verify(data.password, DUMMY_HASH, 'bcrypt')
          await acctLimit.recordFailure(db, normalizedEmail)
          logger.warn('User not found for sign-in')
          return signInError(c, data.email, { form: ['Invalid sign in.'] }, form.next)
        }

        const isPasswordValid = await Bun.password.verify(data.password, user.passwordHash, 'bcrypt')

        if (!isPasswordValid) {
          await acctLimit.recordFailure(db, normalizedEmail)
          logger.warn({ userId: user.id }, 'Invalid password for sign-in')
          return signInError(c, data.email, { form: ['Invalid sign in.'] }, form.next)
        }

        if (user.status === 'pending') {
          // correct password — a stuck-mid-validation user retrying is not a credential failure
          logger.warn({ userId: user.id }, 'Sign-in attempt for pending account')
          return signInError(c, data.email, {
            form: ['Please validate your email address before signing in. Need a new link? Use "Resend it" below.']
          }, form.next)
        }

        if (user.status !== 'active') {
          await acctLimit.recordFailure(db, normalizedEmail)
          logger.warn({ userId: user.id, status: user.status }, 'Sign-in attempt for non-active account')
          return signInError(c, data.email, { form: ['Invalid sign in.'] }, form.next)
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
        return utils.redirect(c, safeNext(form.next) ?? '/')
      } catch (error) {
        utils.logError(logger, error, 'Error during sign-in')
        return signInError(c, data.email, { form: ['An unexpected error occurred. Please try again later.'] }, form.next)
      }
    }
  })
}
