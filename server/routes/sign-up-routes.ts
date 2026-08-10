import type API from '@api/index'
import AccountValidationFailurePage from '@pages/account-validation-failure'
import AccountValidationSuccessPage from '@pages/account-validation-success'
import ResendValidationPage from '@pages/resend-validation'
import SignUpPage from '@pages/sign-up'
import ResendValidationForm from '@templates/components/resend-validation-form'
import SignUpForm, { type SignUpFormProps } from '@templates/components/sign-up-form'
import type { Context, Hono } from 'hono'
import normalizeEmail from 'normalize-email'
import type { Logger } from 'pino'
import Uniquey from 'uniquey'
import { z } from 'zod'
import type { Config } from '@/config'
import * as m from '@/middleware'
import * as utils from '@/utils'

const uniquey = new Uniquey() // short by design: public uid, not a secret
const tokenUniquey = new Uniquey({ length: 32 })

// shared by sign-up and resend so the validation URL / email construction lives in one place
async function sendValidationEmail(
  api: API,
  config: Config,
  user: { username: string; uid: string; email: string },
  token: string
) {
  await api.email.sendEmail({
    to: user.email,
    subject: 'Welcome to Social Stuffs! Please validate your account.',
    template: 'account-validation-email',
    data: {
      username: user.username,
      url: new URL(`/validate-account/${token}/${user.uid}`, config.baseLinkUrl).href
    }
  })
}

const signUpSchema = z
  .object({
    username: utils.usernameSchema,
    email: utils.emailSchema,
    confirmEmail: z.string().min(1, 'Confirm Email is required.'),
    password: utils.passwordSchema,
    confirmPassword: z.string().min(1, 'Confirm Password is required.')
  })
  .refine((data) => data.email === data.confirmEmail, {
    error: 'Emails do not match.',
    path: ['confirmEmail']
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: 'Passwords do not match.',
    path: ['confirmPassword']
  })

type SignUpData = z.infer<typeof signUpSchema>

// HTMX failures re-render the form fragment; no-JS failures re-render the full page (mirrors GET /sign-up).
// Password values are never rendered by the form (password inputs don't render values)
function signUpError(c: Context, values: SignUpFormProps, errors: Record<string, string[]>) {
  return utils.formErrorResponse(c, SignUpForm({ ...values, errors }), SignUpPage({ ...values, errors }), {
    title: 'Sign Up',
    description: 'Create an account for socialstuffs.',
    styles: ['auth']
  })
}

export default function SignUpRoutes(app: Hono, logger: Logger) {
  logger.info('Registering sign-up routes')

  app.get('/sign-up', (c) => {
    return c.render(SignUpPage(), { title: 'Sign Up', description: 'Create an account for socialstuffs.', styles: ['auth'] })
  })

  const signUpLimit = m.rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    keyPrefix: 'sign-up',
    // echo the typed values back so a 429 doesn't wipe the form (the limiter already set the 429 status)
    onLimit: async (c) => {
      const form = await utils.formStrings(c)
      return signUpError(c, form, { form: ['Too many attempts. Please try again later.'] })
    }
  })

  app.post('/sign-up', signUpLimit, async (c) => {
    const form = await utils.formStrings(c)
    const result = utils.validateFormData<SignUpData>(form, signUpSchema)

    const { db, logger, api, config, flash } = c.var

    // schema errors: re-render the form immediately without normalizing or touching the db
    if (!result.success) {
      logger.warn({ errors: result.errors }, 'Validation errors on sign-up form')
      return signUpError(c, form, result.errors)
    }

    const { data } = result

    const normalizedEmail = normalizeEmail(data.email)
    const normalizedUsername = utils.normalizeUsername(data.username)

    // does user already exist?
    const existingUsers = await db
      .selectFrom('users')
      .where((q) => q.or([q('normalizedEmail', '=', normalizedEmail), q('normalizedUsername', '=', normalizedUsername)]))
      .select(['normalizedEmail', 'normalizedUsername'])
      .execute()

    logger.debug({ existing: existingUsers.length }, 'Checking for existing user')

    const errors: Partial<Record<keyof SignUpData, string[]>> = {}
    if (existingUsers.length > 0) {
      if (existingUsers.some((user) => user.normalizedEmail === normalizedEmail)) {
        errors.email = ['Email is already in use.']
      }
      if (existingUsers.some((user) => user.normalizedUsername === normalizedUsername)) {
        errors.username = ['Username is already in use.']
      }
    }

    if (Object.keys(errors).length > 0) {
      logger.warn({ errors }, 'Validation errors on sign-up form')
      return signUpError(c, data, errors)
    }

    const passwordHash = await Bun.password.hash(data.password, {
      algorithm: 'bcrypt',
      cost: 10
    })

    // No catch-all: in-form errors are reserved for expected validation states (handled above);
    // unexpected throws — including a unique-violation race past the pre-check — go to the
    // errorHandler (OOB flash for HTMX, styled error page for no-JS)
    // create the user and its validation token atomically
    const { user, token } = await db.transaction().execute(async (trx) => {
      const user = await trx
        .insertInto('users')
        .values({
          uid: uniquey.create(),
          username: data.username,
          normalizedUsername,
          email: data.email,
          normalizedEmail,
          passwordHash
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      const token = tokenUniquey.create()
      await trx.insertInto('accountValidationTokens').values({ token, userId: user.id }).execute()

      return { user, token }
    })

    // deliberate catch: the account exists now, so a failed email send is non-fatal — log it and
    // tell the user they can request a new link
    try {
      await sendValidationEmail(api, config, user, token)
      await flash.addFlash('success', 'Account created successfully. Please check your email to validate your account.')
    } catch (error) {
      utils.logError(logger, error, 'Error sending account validation email')
      await flash.addFlash(
        'info',
        "Account created, but we couldn't send the validation email. You can request a new link from the sign-in page."
      )
    }
    return utils.redirect(c, '/sign-in')
  })

  app.get('/resend-validation', (c) => {
    return c.render(ResendValidationPage(), {
      title: 'Resend Validation',
      description: 'Request a new account validation link.',
      styles: ['auth']
    })
  })

  const resendLimit = m.rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    keyPrefix: 'resend-validation',
    // echo the typed email back so a 429 doesn't wipe the form (the limiter already set the 429 status)
    onLimit: async (c) => {
      const form = await utils.formStrings(c)
      const errors = { form: ['Too many attempts. Please try again later.'] }
      return utils.formErrorResponse(
        c,
        ResendValidationForm({ email: form.email, errors }),
        ResendValidationPage({ email: form.email, errors }),
        { title: 'Resend Validation', description: 'Request a new account validation link.', styles: ['auth'] }
      )
    }
  })

  app.post('/resend-validation', resendLimit, async (c) => {
    const { db, logger, api, config, flash } = c.var
    const form = await utils.formStrings(c)
    const email = form.email

    // always respond identically so we never reveal whether an email maps to an account or its status
    const neutral = async () => {
      await flash.addFlash('info', "If that email matches a pending account, we've sent a new validation link.")
      return utils.redirect(c, '/sign-in')
    }

    if (!email) return neutral()

    try {
      // Note: response is identical across match/no-match/active, but the match path is
      // measurably slower (extra token insert + email send). Accepted: rate-limited, and only
      // leaks "a pending account exists" — the same bit sign-up already exposes.
      const normalizedEmail = normalizeEmail(email)
      const user = await db
        .selectFrom('users')
        .where('normalizedEmail', '=', normalizedEmail)
        .where('status', '=', 'pending')
        .selectAll()
        .executeTakeFirst()

      if (user) {
        const token = tokenUniquey.create()
        await db.insertInto('accountValidationTokens').values({ token, userId: user.id }).execute()
        await sendValidationEmail(api, config, user, token)
        logger.info({ userId: user.id }, 'Resent account validation email')
      } else {
        logger.info('Resend validation requested for unknown or non-pending email')
      }
    } catch (error) {
      utils.logError(logger, error, 'Error resending account validation email')
    }

    return neutral()
  })

  const validateLimit = m.rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,
    keyPrefix: 'validate-account',
    onLimit: (c) =>
      c.render(AccountValidationFailurePage({ message: 'Too many attempts. Please try again later.' }), {
        title: 'Account Validation Failure',
        description: 'Too many account validation attempts.'
      })
  })

  app.get('/validate-account/:token/:uid', validateLimit, async (c) => {
    const { token, uid } = c.req.param()
    const { db, logger } = c.var

    try {
      const tokenRow = await db
        .selectFrom('accountValidationTokens')
        .innerJoin('users', 'users.id', 'accountValidationTokens.userId')
        .where('accountValidationTokens.token', '=', token)
        .select([
          'accountValidationTokens.id',
          'accountValidationTokens.userId',
          'accountValidationTokens.claimed',
          'accountValidationTokens.created',
          'users.uid as userUid'
        ])
        .executeTakeFirst()

      let invalidToken = false

      if (!tokenRow) {
        logger.warn({ uid }, 'Account validation invalid token')
        invalidToken = true
      } else if (tokenRow.userUid !== uid) {
        logger.warn({ uid }, 'Account validation token does not match user')
        invalidToken = true
      } else if (tokenRow.claimed) {
        logger.warn({ uid }, 'Account validation token has already been claimed')
        invalidToken = true
      } else if (Date.now() - tokenRow.created.getTime() > utils.TOKEN_TTL_MS) {
        logger.warn({ uid }, 'Account validation token has expired')
        invalidToken = true
      }

      if (!invalidToken) {
        const claimed = await db.transaction().execute(async (trx) => {
          const claim = await trx
            .updateTable('accountValidationTokens')
            .set({ claimed: new Date() })
            .where('token', '=', token)
            .where('claimed', 'is', null)
            .returning('userId')
            .executeTakeFirst()

          if (!claim) return false

          await trx.updateTable('users').set({ status: 'active' }).where('id', '=', claim.userId).where('uid', '=', uid).execute()

          return true
        })

        if (!claimed) {
          logger.warn({ uid }, 'Account validation token was claimed concurrently')
          invalidToken = true
        }
      }

      if (invalidToken) {
        c.status(400)
        return c.render(AccountValidationFailurePage({ message: 'The account validation link is invalid or has expired.' }), {
          title: 'Account Validation Failure',
          description: 'Invalid account validation link.'
        })
      }

      logger.info({ uid }, 'User account validated successfully')

      return c.render(AccountValidationSuccessPage(), {
        title: 'Account Validation Success',
        description: 'Your account has been validated successfully.'
      })
    } catch (error) {
      utils.logError(logger, error, 'Error validating account')
      c.status(500)
      return c.render(AccountValidationFailurePage({ message: 'Something went wrong. Please try again later.' }), {
        title: 'Account Validation Failure',
        description: 'An unexpected error occurred.'
      })
    }
  })
}
