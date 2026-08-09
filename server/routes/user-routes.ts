import type { UserStatus } from '@data/user-data'
import UserDataPage from '@pages/user/data'
import EditProfilePage from '@pages/user/edit-profile'
import MyProfilePage from '@pages/user/my-profile'
import UserSettingsPage from '@pages/user/settings'
import UserSettingsForm from '@templates/components/user/settings-form'
import type { Hono } from 'hono'
import normalizeEmail from 'normalize-email'
import type { Logger } from 'pino'
import Uniquey from 'uniquey'
import { z } from 'zod'
import * as m from '@/middleware'
import * as utils from '@/utils'

const tokenUniquey = new Uniquey({ length: 32 })

const settingsSchema = z
  .object({
    username: utils.usernameSchema,
    email: utils.emailSchema,
    // blank means "keep current password"; anything else gets the full sign-up strength rules
    password: z.union([z.literal(''), utils.passwordSchema]).optional(),
    confirmPassword: z.string().optional()
  })
  .refine((data) => !data.password || data.password === data.confirmPassword, {
    error: 'Passwords do not match.',
    path: ['confirmPassword']
  })

type SettingsData = z.infer<typeof settingsSchema>

export default function UserRoutes(app: Hono, logger: Logger) {
  logger.info('Registering user routes')
  const user = app.basePath('/user')
  user.use('*', m.authorize({ requireAuth: true }))

  user.get('/', async (c) => {
    return c.render(MyProfilePage(), {
      title: 'My Profile',
      description: 'This is my profile page.',
      styles: ['user']
    })
  })

  user.get('/edit-profile', async (c) => {
    return c.render(EditProfilePage(), {
      title: 'Edit Profile',
      description: 'This is the edit profile page.',
      styles: ['user']
    })
  })

  user.get('/settings', async (c) => {
    const dbUser = await c.var.auth.getUser()
    return c.render(UserSettingsPage({ username: dbUser?.username, email: dbUser?.email }), {
      title: 'Settings',
      description: 'This is the settings page.',
      styles: ['user', 'auth']
    })
  })

  user.post('/settings', async (c) => {
    const { logger, flash, auth, db, api, config } = c.var
    const formData = await c.req.formData()
    const form = Object.fromEntries(formData.entries()) as Record<string, string>
    const result = utils.validateFormData<SettingsData>(form, settingsSchema)

    if (!result.success) {
      logger.warn({ errors: result.errors }, 'Validation errors on settings form')
      return c.html(UserSettingsForm({ ...form, errors: result.errors }))
    }

    const { data } = result
    const user = await auth.getUser()
    let changed = false

    const toUpdate: {
      username: string | undefined
      normalizedUsername: string | undefined
      email: string | undefined
      normalizedEmail: string | undefined
      passwordHash: string | undefined
      status: UserStatus | undefined
    } = {
      username: undefined,
      normalizedUsername: undefined,
      email: undefined,
      normalizedEmail: undefined,
      passwordHash: undefined,
      status: undefined
    }
    if (user == null) throw new Response('Invalid user', { status: 401 }) // this should never happen due to the authorize middleware

    const normalizedEmail = normalizeEmail(data.email)
    if (user.email !== data.email) {
      // check to see if the new email is already in use via the API
      const emailInUse = await db
        .selectFrom('users')
        .select('id')
        .where('normalizedEmail', '=', normalizedEmail)
        .executeTakeFirst()
      if (emailInUse != null) return c.html(UserSettingsForm({ ...form, errors: { email: ['Email is already in use.'] } }))
      toUpdate.email = data.email
      toUpdate.normalizedEmail = normalizedEmail
      changed = true
    }

    const normalizedUsername = data.username?.trim().toLowerCase()
    if (user.username !== data.username) {
      // check to see if the new username is already in use via the API
      const usernameInUse = await db
        .selectFrom('users')
        .select('id')
        .where('normalizedUsername', '=', normalizedUsername)
        .executeTakeFirst()
      if (usernameInUse != null)
        return c.html(UserSettingsForm({ ...form, errors: { username: ['Username is already in use.'] } }))
      toUpdate.username = data.username
      toUpdate.normalizedUsername = normalizedUsername
      changed = true
    }

    if (data.password) {
      const passwordHash = await Bun.password.hash(data.password, {
        algorithm: 'bcrypt',
        cost: 10
      })
      toUpdate.passwordHash = passwordHash
      changed = true
    }

    if (changed) {
      // an email change must be re-verified: flip the account back to pending, sign the user
      // out, and send a validation link to the new address (claiming it reactivates the account)
      if (toUpdate.email !== undefined) {
        toUpdate.status = 'pending'
        const token = tokenUniquey.create()
        await db.transaction().execute(async (trx) => {
          await trx.updateTable('users').set(toUpdate).where('id', '=', user.id).execute()
          await trx.insertInto('accountValidationTokens').values({ token, userId: user.id }).execute()
        })
        await auth.signOut()

        // the account is already pending, so a failed send is non-fatal: the sign-in page's
        // resend flow can issue a new link
        try {
          await api.email.sendEmail({
            to: data.email,
            subject: 'Please verify your new email address for Social Stuffs.',
            template: 'email-change-validation-email',
            data: {
              username: toUpdate.username ?? user.username,
              url: new URL(`/validate-account/${token}/${user.uid}`, config.baseLinkUrl).href
            }
          })
          await flash.addFlash(
            'info',
            'You have been signed out. Check your new email for a link to verify it before signing in.'
          )
        } catch (error) {
          utils.logError(logger, error, 'Error sending email change validation email')
          await flash.addFlash(
            'info',
            "You have been signed out, but we couldn't send the verification email. Request a new link from the sign-in page."
          )
        }
        // courtesy notice to the old address so a hijacked account isn't changed silently; log-only on failure
        try {
          await api.email.sendEmail({
            to: user.email,
            subject: 'Your Social Stuffs email address was changed.',
            template: 'email-change-notice-email',
            data: {
              username: toUpdate.username ?? user.username,
              newEmail: data.email
            }
          })
        } catch (error) {
          utils.logError(logger, error, 'Error sending email change notice to old address')
        }

        logger.info({ uid: user.uid }, 'Email changed; user set to pending and signed out')
        return utils.redirect(c, '/sign-in')
      }

      await db.updateTable('users').set(toUpdate).where('id', '=', user.id).execute()

      // the JWT carries pwv/username claims minted at sign-in; re-sign it after a password or
      // username change so authorize()'s pwv check doesn't 401 this session on the next request
      if (auth.user && (toUpdate.passwordHash || toUpdate.username)) {
        const { uid, status, role } = auth.user
        await auth.setUser({
          uid,
          status,
          role,
          username: toUpdate.username ?? auth.user.username,
          pwv: toUpdate.passwordHash ? m.passwordVersion(toUpdate.passwordHash) : auth.user.pwv
        })
      }
    }

    logger.info({ uid: auth.user?.uid, changed }, 'Settings updated')

    await flash.addFlash('info', changed ? 'Settings updated successfully.' : 'No changes made.')
    return utils.redirect(c, '/user/settings')
  })

  user.get('/data', async (c) => {
    return c.render(UserDataPage(), {
      title: 'My Data',
      description: 'This is my data page.',
      styles: ['user']
    })
  })

  user.post('/sign-out', async (c) => {
    const { auth, flash } = c.var
    await auth.signOut()
    await flash.addFlash('success', 'You have been signed out.')
    return utils.redirect(c, '/')
  })
}
