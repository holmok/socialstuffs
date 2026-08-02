import SignUpForm from '@components/signup-form'
import AboutPage from '@pages/about'
import HomePage from '@pages/home'
import SignInPage from '@pages/sign-in'
import SignUpPage from '@pages/sign-up'
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

export default function PublicRoutes(app: Hono, logger: Logger) {
  logger.info('Registering public routes')

  app.get('/', (c) => {
    return c.html(
      HomePage({
        description: 'A server-rendered starter app built with Bun, Hono, and HTMX.'
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

    const { db, logger } = c.var

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
      // ...otherwise create user
      const passwordHash = await Bun.password.hash(data.password, {
        algorithm: 'bcrypt',
        cost: 10
      })
      await db
        .insertInto('users')
        .values({
          uid: uniquey.create(),
          username: data.username,
          normalizedUsername,
          email: data.email,
          normalizedEmail,
          passwordHash
        })
        .execute()

      return c.redirect('/sign-in', 303)
    }
  })
}
