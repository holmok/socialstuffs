import RecoverPasswordPage from '@pages/recover-password'
import RecoverPasswordFailurePage from '@pages/recover-password-failure'
import RecoverPasswordSetPage from '@pages/recover-password-set'
import RecoverPasswordForm from '@templates/components/recover-password-form'
import SetPasswordForm from '@templates/components/set-password-form'
import type { Hono } from 'hono'
import normalizeEmail from 'normalize-email'
import type { Logger } from 'pino'
import Uniquey from 'uniquey'
import { z } from 'zod'
import * as m from '@/middleware'
import * as utils from '@/utils'

const tokenUniquey = new Uniquey({ length: 32 })

const TOKEN_TTL_MS = 48 * 60 * 60 * 1000

// same password rules as sign-up, plus a confirm-match refine
const setPasswordSchema = z
  .object({
    password: z
      .string()
      .min(10, 'Password must be at least 10 characters long.')
      .max(255, 'Password must be at most 255 characters long.')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter.')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter.')
      .regex(/[0-9]/, 'Password must contain at least one number.')
      .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character.')
      .regex(/^[^\s]*$/, 'Password must not contain spaces.'),
    confirmPassword: z.string().min(1, 'Confirm Password is required.')
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: 'Passwords do not match.',
    path: ['confirmPassword']
  })

type SetPasswordData = z.infer<typeof setPasswordSchema>

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
    onLimit: (c) => c.html(RecoverPasswordForm({ errors: { form: ['Too many attempts. Please try again later.'] } }))
  })

  app.post('/recover-password', recoverLimit, async (c) => {
    const { db, logger, api, config, flash } = c.var
    const formData = await c.req.formData()
    const form = Object.fromEntries(formData.entries()) as Record<string, string>
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
        logger.info({ normalizedEmail }, 'Password recovery requested for unknown or non-active email')
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
      const tokenRow = await db
        .selectFrom('passwordRecoveryTokens')
        .innerJoin('users', 'users.id', 'passwordRecoveryTokens.userId')
        .where('passwordRecoveryTokens.token', '=', token)
        .select([
          'passwordRecoveryTokens.userId',
          'passwordRecoveryTokens.claimed',
          'passwordRecoveryTokens.created',
          'users.uid as userUid'
        ])
        .executeTakeFirst()

      let invalidToken = false

      if (!tokenRow) {
        logger.warn({ uid }, 'Password reset invalid token')
        invalidToken = true
      } else if (tokenRow.userUid !== uid) {
        logger.warn({ uid }, 'Password reset token does not match user')
        invalidToken = true
      } else if (tokenRow.claimed) {
        logger.warn({ uid }, 'Password reset token has already been claimed')
        invalidToken = true
      } else if (Date.now() - tokenRow.created.getTime() > TOKEN_TTL_MS) {
        logger.warn({ uid }, 'Password reset token has expired')
        invalidToken = true
      }

      if (invalidToken) {
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
    const formData = await c.req.formData()
    const form = Object.fromEntries(formData.entries()) as Record<string, string>
    const result = utils.validateFormData<SetPasswordData>(form, setPasswordSchema)

    if (!result.success) {
      logger.warn({ errors: result.errors }, 'Validation errors on set-password form')
      return c.html(SetPasswordForm({ token, uid, errors: result.errors }))
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

    try {
      // validate BEFORE claiming (mirrors validate-account): reject missing / uid-mismatch /
      // already-claimed / expired. uid and created are immutable so pre-checking them is TOCTOU-free;
      // only `claimed` races, and the atomic claim below (with a freshness predicate) handles that.
      const tokenRow = await db
        .selectFrom('passwordRecoveryTokens')
        .innerJoin('users', 'users.id', 'passwordRecoveryTokens.userId')
        .where('passwordRecoveryTokens.token', '=', token)
        .select([
          'passwordRecoveryTokens.userId',
          'passwordRecoveryTokens.claimed',
          'passwordRecoveryTokens.created',
          'users.uid as userUid'
        ])
        .executeTakeFirst()

      if (!tokenRow) {
        logger.warn({ uid }, 'Password reset invalid token')
        return failure()
      } else if (tokenRow.userUid !== uid) {
        logger.warn({ uid }, 'Password reset token does not match user')
        return failure()
      } else if (tokenRow.claimed) {
        logger.warn({ uid }, 'Password reset token has already been claimed')
        return failure()
      } else if (Date.now() - tokenRow.created.getTime() > TOKEN_TTL_MS) {
        logger.warn({ uid }, 'Password reset token has expired')
        return failure()
      }

      const passwordHash = await Bun.password.hash(data.password, { algorithm: 'bcrypt', cost: 10 })

      // atomically claim the single-use token AND update the password in one transaction; the
      // freshness predicate keeps expiry race-safe alongside the `claimed is null` single-use guard
      const claimed = await db.transaction().execute(async (trx) => {
        const claim = await trx
          .updateTable('passwordRecoveryTokens')
          .set({ claimed: new Date() })
          .where('token', '=', token)
          .where('claimed', 'is', null)
          .where('created', '>', new Date(Date.now() - TOKEN_TTL_MS))
          .returning('userId')
          .executeTakeFirst()

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
    } catch (error) {
      utils.logError(logger, error, 'Error resetting password')
      return c.html(
        SetPasswordForm({ token, uid, errors: { form: ['An unexpected error occurred. Please try again later.'] } }),
        500
      )
    }
  })
}
