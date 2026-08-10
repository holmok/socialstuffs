import RecoverPasswordPage from '@pages/recover-password'
import RecoverPasswordFailurePage from '@pages/recover-password-failure'
import RecoverPasswordSetPage from '@pages/recover-password-set'
import RecoverPasswordForm from '@templates/components/recover-password-form'
import SetPasswordForm from '@templates/components/set-password-form'
import type { Context, Hono } from 'hono'
import normalizeEmail from 'normalize-email'
import type { Logger } from 'pino'
import Uniquey from 'uniquey'
import { z } from 'zod'
import * as m from '@/middleware'
import * as utils from '@/utils'
import { checkToken, claimToken, type TokenCheckFailure } from './token-helpers'

const tokenUniquey = new Uniquey({ length: 32 })

// per-reason log messages for the shared checkToken helper, used by both the GET form and the
// POST reset (this route keeps its own wording)
const resetFailureLog: Record<TokenCheckFailure, string> = {
  missing: 'Password reset invalid token',
  uidMismatch: 'Password reset token does not match user',
  claimed: 'Password reset token has already been claimed',
  expired: 'Password reset token has expired'
}

// same password rules as sign-up (utils.passwordSchema), plus a confirm-match refine
const setPasswordSchema = z
  .object({
    password: utils.passwordSchema,
    confirmPassword: z.string().min(1, 'Confirm Password is required.')
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: 'Passwords do not match.',
    path: ['confirmPassword']
  })

type SetPasswordData = z.infer<typeof setPasswordSchema>

// HTMX failures re-render the set-password form fragment; no-JS failures re-render the full page
// (mirrors the GET form). Password values are never echoed back
function setPasswordError(c: Context, token: string, uid: string, errors: Record<string, string[]>) {
  return utils.formErrorResponse(c, SetPasswordForm({ token, uid, errors }), RecoverPasswordSetPage({ token, uid, errors }), {
    title: 'Set a New Password',
    description: 'Choose a new password for your account.',
    styles: ['auth']
  })
}

export default function RecoverPasswordRoutes(app: Hono, logger: Logger) {
  logger.info('Registering recover-password routes')

  app.get('/recover-password', (c) => {
    return c.render(RecoverPasswordPage(), {
      title: 'Recover Password',
      description: 'Request a password reset link.',
      styles: ['auth']
    })
  })

  const recoverLimit = m.rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    keyPrefix: 'recover-password',
    // echo the typed email back so a 429 doesn't wipe the form (the limiter already set the 429 status)
    onLimit: async (c) => {
      const form = await utils.formStrings(c)
      const errors = { form: ['Too many attempts. Please try again later.'] }
      return utils.formErrorResponse(
        c,
        RecoverPasswordForm({ email: form.email, errors }),
        RecoverPasswordPage({ email: form.email, errors }),
        { title: 'Recover Password', description: 'Request a password reset link.', styles: ['auth'] }
      )
    }
  })

  app.post('/recover-password', recoverLimit, async (c) => {
    const { db, logger, api, config, flash } = c.var
    const form = await utils.formStrings(c)
    const email = form.email

    // always respond identically so we never reveal whether an email maps to an account or its status
    const neutral = async () => {
      await flash.addFlash('info', "If that email matches an account, we've sent a password reset link.")
      return utils.redirect(c, '/sign-in')
    }

    if (!email) return neutral()

    try {
      // Note: response is identical across match/no-match/inactive, but the match path is
      // measurably slower (extra token insert + email send). Accepted: rate-limited, same
      // residual timing side-channel as the resend-validation flow.
      const normalizedEmail = normalizeEmail(email)
      const user = await db
        .selectFrom('users')
        .where('normalizedEmail', '=', normalizedEmail)
        .where('status', '=', 'active')
        .select(['id', 'uid', 'username', 'email'])
        .executeTakeFirst()

      if (user) {
        const token = tokenUniquey.create()
        await db.insertInto('passwordRecoveryTokens').values({ token, userId: user.id }).execute()
        // a failed email send must not change the neutral response: log it and carry on
        try {
          await api.email.sendEmail({
            to: user.email,
            subject: 'Reset your Social Stuffs password',
            template: 'password-recovery-email',
            data: {
              username: user.username,
              url: new URL(`/recover-password/${token}/${user.uid}`, config.baseLinkUrl).href
            }
          })
          logger.info({ userId: user.id }, 'Sent password recovery email')
        } catch (error) {
          utils.logError(logger, error, 'Error sending password recovery email')
        }
      } else {
        logger.info('Password recovery requested for unknown or non-active email')
      }
    } catch (error) {
      utils.logError(logger, error, 'Error processing password recovery request')
    }

    return neutral()
  })

  const resetLimit = m.rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,
    keyPrefix: 'reset-password',
    onLimit: (c) =>
      c.render(RecoverPasswordFailurePage({ message: 'Too many attempts. Please try again later.' }), {
        title: 'Password Reset Failure',
        description: 'Too many password reset attempts.'
      })
  })

  app.get('/recover-password/:token/:uid', resetLimit, async (c) => {
    const { token, uid } = c.req.param()
    const { db, logger } = c.var

    try {
      const check = await checkToken(db, 'passwordRecoveryTokens', token, uid, utils.TOKEN_TTL_MS)

      if (!check.ok) {
        logger.warn({ uid }, resetFailureLog[check.reason])
        c.status(400)
        return c.render(RecoverPasswordFailurePage({ message: 'The password reset link is invalid or has expired.' }), {
          title: 'Password Reset Failure',
          description: 'Invalid password reset link.',
          styles: ['auth']
        })
      }

      return c.render(RecoverPasswordSetPage({ token, uid }), {
        title: 'Set a New Password',
        description: 'Choose a new password for your account.',
        styles: ['auth']
      })
    } catch (error) {
      utils.logError(logger, error, 'Error rendering password reset form')
      c.status(500)
      return c.render(RecoverPasswordFailurePage({ message: 'Something went wrong. Please try again later.' }), {
        title: 'Password Reset Failure',
        description: 'An unexpected error occurred.',
        styles: ['auth']
      })
    }
  })

  app.post('/recover-password/:token/:uid', resetLimit, async (c) => {
    const { token, uid } = c.req.param()
    const { db, logger, flash } = c.var
    const form = await utils.formStrings(c)
    const result = utils.validateFormData<SetPasswordData>(form, setPasswordSchema)

    if (!result.success) {
      logger.warn({ errors: result.errors }, 'Validation errors on set-password form')
      return setPasswordError(c, token, uid, result.errors)
    }

    const { data } = result

    const failure = () => {
      c.status(400)
      return c.render(RecoverPasswordFailurePage({ message: 'The password reset link is invalid or has expired.' }), {
        title: 'Password Reset Failure',
        description: 'Invalid password reset link.',
        styles: ['auth']
      })
    }

    // No catch-all: every expected failure state (missing / uid-mismatch / already-claimed / expired /
    // concurrently-claimed token) returns failure() explicitly; unexpected throws go to the errorHandler.
    // uid and created are immutable so pre-checking them is TOCTOU-free; only `claimed` races, and
    // claimToken's atomic claim (with its freshness predicate) handles that.
    const check = await checkToken(db, 'passwordRecoveryTokens', token, uid, utils.TOKEN_TTL_MS)
    if (!check.ok) {
      logger.warn({ uid }, resetFailureLog[check.reason])
      return failure()
    }

    const passwordHash = await Bun.password.hash(data.password, { algorithm: 'bcrypt', cost: 10 })

    // atomically claim the single-use token AND update the password in one transaction; claimToken
    // carries the freshness predicate alongside the `claimed is null` single-use guard
    const claimed = await db.transaction().execute(async (trx) => {
      const claim = await claimToken(trx, 'passwordRecoveryTokens', token, utils.TOKEN_TTL_MS)
      if (!claim) return false

      await trx.updateTable('users').set({ passwordHash }).where('id', '=', claim.userId).where('uid', '=', uid).execute()

      return true
    })

    if (!claimed) {
      logger.warn({ uid }, 'Password reset token was claimed concurrently')
      return failure()
    }

    logger.info({ uid }, 'Password reset successfully')
    await flash.addFlash('success', 'Your password has been reset. Please sign in.')
    return utils.redirect(c, '/sign-in')
  })
}
