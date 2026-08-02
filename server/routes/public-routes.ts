import AboutPage from '@pages/about'
import AccountValidationFailurePage from '@pages/account-validation-failure'
import AccountValidationSuccessPage from '@pages/account-validation-success'
import HomePage from '@pages/home'
import SignInPage from '@pages/sign-in'
import SignUpPage from '@pages/sign-up'
import SignInForm from '@templates/components/sign-in-form'
import SignUpForm from '@templates/components/sign-up-form'
import type { Hono } from 'hono'
import normalizeEmail from 'normalize-email'
import type { Logger } from 'pino'
import Uniquey from 'uniquey'
import { z } from 'zod'
import * as utils from '@/utils'

const uniquey = new Uniquey()

const signUpSchema = z
  .object({
    username: z
      .string()
      .min(1, 'Username is required.')
      .max(15, 'Username must be at most 15 characters long.')
      .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores.')
      .regex(/^[^_]/, 'Username cannot start with an underscore.')
      .regex(/[^_]$/, 'Username cannot end with an underscore.')
      .regex(/^[^0-9]/, 'Username cannot start with a number.'),
    email: z
      .email({ message: 'Invalid email address' })
      .min(1, 'Email is required.')
      .max(255, 'Email must be at most 255 characters long.'),
    confirmEmail: z.string().min(1, 'Confirm Email is required.'),
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
  .refine((data) => data.email === data.confirmEmail, {
    message: 'Emails do not match.',
    path: ['confirmEmail']
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword']
  })

type SignUpData = z.infer<typeof signUpSchema>

const signInSchema = z.object({
  email: z.string().min(1, 'Email is required.').max(255, 'Email must be at most 255 characters long.'),
  password: z.string().min(1, 'Password is required.').max(255, 'Password must be at most 255 characters long.')
})

type SignInData = z.infer<typeof signInSchema>

export default function PublicRoutes(app: Hono, logger: Logger) {
  logger.info('Registering public routes')

  app.get('/', (c) => {
    const { auth, logger } = c.var
    logger.debug({ user: auth.user }, 'Rendering home page with user context')
    return c.html(
      HomePage({
        description: 'A server-rendered starter app built with Bun, Hono, and HTMX.',
        user: auth.user
      })
    )
  })

  app.get('/about', (c) => {
    return c.html(AboutPage({ description: 'About the Bun + Hono + HTMX starter app.' }))
  })

  app.get('/sign-in', (c) => {
    return c.html(
      SignInPage({
        description: 'Sign in to the Bun + Hono + HTMX starter app.'
      })
    )
  })

  app.post('/sign-in', async (c) => {
    const formData = await c.req.formData()
    const form = Object.fromEntries(formData.entries()) as SignInData
    const { data, errors } = utils.validateFormData<SignInData>(form, signInSchema)

    if (Object.keys(errors).length > 0) {
      logger.warn({ errors }, 'Validation errors on sign-in form')
      return c.html(SignInForm({ ...data, errors }))
    } else {
      const { db, logger, auth } = c.var

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

        return utils.redirect(c, '/')
      } catch (error) {
        utils.logError(logger, error, 'Error during sign-in')
        return c.html(SignInForm({ ...data, errors: { form: ['An unexpected error occurred. Please try again later.'] } }))
      }
    }
  })

  app.get('/sign-up', (c) => {
    return c.html(
      SignUpPage({
        description: 'Create an account for the Bun + Hono + HTMX starter app.'
      })
    )
  })

  app.post('/sign-up', async (c) => {
    const formData = await c.req.formData()
    const form = Object.fromEntries(formData.entries()) as SignUpData
    const { data, errors } = utils.validateFormData<SignUpData>(form, signUpSchema)

    const { db, logger, api, config } = c.var

    const normalizedEmail = normalizeEmail(data.email)
    const normalizedUsername = data.username.toLowerCase()

    // does user already exist?
    const existingUsers = await db
      .selectFrom('users')
      .where((q) => q.or([q('normalizedEmail', '=', normalizedEmail), q('normalizedUsername', '=', normalizedUsername)]))
      .select(['normalizedEmail', 'normalizedUsername'])
      .execute()

    logger.debug({ normalizedEmail, normalizedUsername, existingUsers }, 'Checking for existing user')

    if (existingUsers.length > 0) {
      if (existingUsers.some((user) => user.normalizedEmail === normalizedEmail)) {
        errors.email = [...(errors?.email || []), 'Email is already in use.']
      }
      if (existingUsers.some((user) => user.normalizedUsername === normalizedUsername)) {
        errors.username = [...(errors?.username || []), 'Username is already in use.']
      }
    }

    // if there are errors, return the form with errors
    if (Object.keys(errors).length > 0) {
      logger.warn({ errors }, 'Validation errors on sign-up form')
      return c.html(SignUpForm({ ...data, errors }))
    } else {
      try {
        // ...otherwise create user
        const passwordHash = await Bun.password.hash(data.password, {
          algorithm: 'bcrypt',
          cost: 10
        })
        const [user] = await db
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
          .execute()

        const token = uniquey.create()
        await db
          .insertInto('accountValidationTokens')
          .values({
            token,
            userId: user.id
          })
          .execute()

        await api.email.sendEmail({
          to: form.email,
          subject: 'Welcome to Social Stuffs! Please validate your account.',
          template: 'account-validation-email',
          data: {
            username: user.username,
            url: `${new URL(`/validate-account/${token}/${user.uid}`, config.baseLinkUrl).href}`
          }
        })

        return utils.redirect(c, '/sign-in')
      } catch (error) {
        utils.logError(logger, error, 'Error creating user')
        return c.html(SignUpForm({ ...data, errors: { form: ['An unexpected error occurred. Please try again later.'] } }), 500)
      }
    }
  })

  app.get('/validate-account/:token/:uid', async (c) => {
    const { token, uid } = c.req.param()
    const { db, logger } = c.var

    try {
      const user = await db
        .selectFrom('users')
        .innerJoin('accountValidationTokens', 'users.id', 'accountValidationTokens.userId')
        .where('accountValidationTokens.token', '=', token)
        .where('users.uid', '=', uid)
        .selectAll()
        .executeTakeFirst()

      const isTokenClaimed = await db
        .selectFrom('accountValidationTokens')
        .where('token', '=', token)
        .select(['claimed', 'userId', 'token'])
        .executeTakeFirst()

      let invalidToken = false

      if (!user) {
        logger.warn({ token, uid }, 'Account validation invalid user uid')
        invalidToken = true
      }

      if (!isTokenClaimed) {
        logger.warn({ token, uid }, 'Account validation invalid token')
        invalidToken = true
      } else if (isTokenClaimed.claimed) {
        logger.warn({ token, uid }, 'Account validation token has already been claimed')
        invalidToken = true
      } else if (user && isTokenClaimed.userId !== user?.id) {
        logger.warn({ token, uid }, 'Account validation token does not match user')
        invalidToken = true
      }

      if (invalidToken) {
        return c.html(
          AccountValidationFailurePage({
            description: 'Invalid account validation link.',
            message: 'The account validation link is invalid or has expired.'
          }),
          400
        )
      }

      await db
        .updateTable('users')
        .set({ status: 'active' })
        .where('id', '=', user?.id as number)
        .execute()

      await db
        .updateTable('accountValidationTokens')
        .set({ claimed: new Date() })
        .where('userId', '=', user?.id as number)
        .execute()

      logger.info({ userId: user?.id, uid: user?.uid }, 'User account validated successfully')

      return c.html(
        AccountValidationSuccessPage({
          description: 'Your account has been validated successfully.'
        })
      )
    } catch (error) {
      utils.logError(logger, error, 'Error validating account')
      return c.html(
        AccountValidationFailurePage({
          description: 'An unexpected error occurred.',
          message: 'Something went wrong. Please try again later.'
        }),
        500
      )
    }
  })
}
