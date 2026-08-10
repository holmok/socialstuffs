import { UserDataError } from '@api/user-data-api'
import type { UserProfileInfo, UserStatus } from '@data/user-data'
import UserDataPage from '@pages/user/data'
import EditProfilePage from '@pages/user/edit-profile'
import MyProfilePage from '@pages/user/my-profile'
import UserSettingsPage from '@pages/user/settings'
import EditProfileForm from '@templates/components/user/edit-profile-form'
import UserSettingsForm from '@templates/components/user/settings-form'
import type { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import normalizeEmail from 'normalize-email'
import type { Logger } from 'pino'
import Uniquey from 'uniquey'
import { z } from 'zod'
import * as m from '@/middleware'
import * as utils from '@/utils'
import { moderateFields, validateAndUploadImage } from './form-helpers'

const tokenUniquey = new Uniquey({ length: 32 })

const settingsSchema = z
  .object({
    username: utils.usernameSchema,
    email: utils.emailSchema,
    // verified against the stored hash before an email or password change is applied
    currentPassword: z.string().optional(),
    // blank means "keep current password"; anything else gets the full sign-up strength rules
    password: z.union([z.literal(''), utils.passwordSchema]).optional(),
    confirmPassword: z.string().optional()
  })
  .refine((data) => !data.password || data.password === data.confirmPassword, {
    error: 'Passwords do not match.',
    path: ['confirmPassword']
  })

type SettingsData = z.infer<typeof settingsSchema>

const profileSchema = z.object({
  fullname: z.string().trim().max(100, 'Full name must be at most 100 characters long.').optional(),
  title: z.string().trim().max(100, 'Title must be at most 100 characters long.').optional(),
  location: z.string().trim().max(100, 'Location must be at most 100 characters long.').optional(),
  bio: z.string().trim().max(500, 'Bio must be at most 500 characters long.').optional()
})

type ProfileData = z.infer<typeof profileSchema>

const profileTextFields = ['fullname', 'title', 'location', 'bio'] as const

export default function UserRoutes(app: Hono, logger: Logger) {
  logger.info('Registering user routes')
  const user = app.basePath('/user')
  user.use('*', m.authorize({ requireAuth: true }))

  user.get('/', async (c) => {
    const dbUser = await c.var.auth.getUser()
    if (dbUser == null) throw new HTTPException(401) // this should never happen due to the authorize middleware
    const info = (dbUser.info ?? {}) as UserProfileInfo
    info.profileImageUrl = utils.displayImageUrl(info, c.var.config.baseImageUrl)
    return c.render(MyProfilePage({ uid: dbUser.uid, username: dbUser.username, created: dbUser.created, info }), {
      title: 'My Profile',
      description: 'This is my profile page.',
      styles: ['user']
    })
  })

  user.get('/edit-profile', async (c) => {
    const dbUser = await c.var.auth.getUser()
    const info = (dbUser?.info ?? {}) as UserProfileInfo
    info.profileImageUrl = utils.displayImageUrl(info, c.var.config.baseImageUrl)
    return c.render(EditProfilePage({ info }), {
      title: 'Edit Profile',
      description: 'This is the edit profile page.',
      styles: ['user', 'auth']
    })
  })

  user.post('/edit-profile', async (c) => {
    const { logger, flash, auth, db, api, config } = c.var
    const formData = await c.req.formData()
    const form: Record<string, string> = {}
    for (const field of profileTextFields) {
      const value = formData.get(field)
      if (typeof value === 'string') form[field] = value
    }

    const user = await auth.getUser()
    if (user == null) throw new HTTPException(401) // this should never happen due to the authorize middleware
    const currentInfo = user.info as UserProfileInfo
    const currentImageUrl = utils.displayImageUrl(currentInfo, config.baseImageUrl)

    // browsers can't restore a picked file into a re-rendered form, so failures unrelated to the
    // image carry a visible "re-select your photo" note. HTMX failures re-render the form fragment;
    // no-JS failures re-render the full page (mirrors GET /user/edit-profile)
    const image = formData.get('image')
    const hadImage = image instanceof File && image.size > 0
    const rerender = (values: ProfileData, errors: Record<string, string[]>) => {
      const imageDroppedNote = hadImage && !errors.image
      return utils.formErrorResponse(
        c,
        EditProfileForm({ ...values, profileImageUrl: currentImageUrl, errors, imageDroppedNote }),
        EditProfilePage({ info: { ...values, profileImageUrl: currentImageUrl }, errors, imageDroppedNote }),
        { title: 'Edit Profile', description: 'This is the edit profile page.', styles: ['user', 'auth'] }
      )
    }

    const result = utils.validateFormData<ProfileData>(form, profileSchema)
    if (!result.success) {
      logger.warn({ errors: result.errors }, 'Validation errors on edit profile form')
      return rerender(form, result.errors)
    }
    const { data } = result

    const moderationErrors = await moderateFields(api, logger, data, profileTextFields)
    if (moderationErrors) return rerender(data, moderationErrors)

    const upload = await validateAndUploadImage(c, formData, {
      userUid: user.uid,
      filenamePrefix: 'profile',
      maxDimension: 512,
      // old profile photos are removed so cached URLs never go stale
      removePrefix: 'profile'
    })
    if ('errors' in upload) return rerender(data, upload.errors)
    const profileImageUrl = upload.url

    const info: UserProfileInfo = {
      ...currentInfo,
      fullname: data.fullname || undefined,
      title: data.title || undefined,
      location: data.location || undefined,
      bio: data.bio || undefined,
      profileImageUrl: profileImageUrl ?? currentInfo.profileImageUrl
    }
    await db.updateTable('users').set({ info }).where('id', '=', user.id).execute()

    logger.info({ uid: user.uid }, 'Profile updated')
    await flash.addFlash('info', 'Profile updated.')
    return utils.redirect(c, '/user/edit-profile')
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
    const form = await utils.formStrings(c)
    // HTMX failures re-render the form fragment; no-JS failures re-render the full page (mirrors
    // GET /user/settings). Only username/email are echoed back — passwords never are
    const rerender = (errors: Record<string, string[]>) =>
      utils.formErrorResponse(
        c,
        UserSettingsForm({ username: form.username, email: form.email, errors }),
        UserSettingsPage({ username: form.username, email: form.email, errors }),
        { title: 'Settings', description: 'This is the settings page.', styles: ['user', 'auth'] }
      )
    const result = utils.validateFormData<SettingsData>(form, settingsSchema)

    if (!result.success) {
      logger.warn({ errors: result.errors }, 'Validation errors on settings form')
      return rerender(result.errors)
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
    if (user == null) throw new HTTPException(401) // this should never happen due to the authorize middleware

    // email and password changes are account-takeover levers for a stolen session, so both
    // require the current password; username-only changes don't
    const changingEmail = user.email !== data.email
    const changingPassword = Boolean(data.password)
    if (changingEmail || changingPassword) {
      if (!data.currentPassword) {
        return rerender({ currentPassword: ['Enter your current password to change your email or password.'] })
      }
      // getUser() deliberately omits passwordHash, so fetch it directly for verification
      const credentials = await db.selectFrom('users').select('passwordHash').where('id', '=', user.id).executeTakeFirstOrThrow()
      const verified = await Bun.password.verify(data.currentPassword, credentials.passwordHash)
      if (!verified) {
        logger.warn({ uid: user.uid }, 'Settings change rejected: current password incorrect')
        return rerender({ currentPassword: ['Your current password is incorrect.'] })
      }
    }

    const normalizedEmail = normalizeEmail(data.email)
    if (changingEmail) {
      // in-use check excludes the user's own row so a case-only change of your own email is allowed
      const emailInUse = await db
        .selectFrom('users')
        .select('id')
        .where('normalizedEmail', '=', normalizedEmail)
        .where('id', '!=', user.id)
        .executeTakeFirst()
      if (emailInUse != null) return rerender({ email: ['Email is already in use.'] })
      toUpdate.email = data.email
      toUpdate.normalizedEmail = normalizedEmail
      changed = true
    }

    const normalizedUsername = utils.normalizeUsername(data.username)
    if (user.username !== data.username) {
      // in-use check excludes the user's own row so a case-only change of your own username is allowed
      const usernameInUse = await db
        .selectFrom('users')
        .select('id')
        .where('normalizedUsername', '=', normalizedUsername)
        .where('id', '!=', user.id)
        .executeTakeFirst()
      if (usernameInUse != null) return rerender({ username: ['Username is already in use.'] })
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
    const dbUser = await c.var.auth.getUser()
    const info = (dbUser?.info ?? {}) as UserProfileInfo
    return c.render(UserDataPage({ lastExportUrl: info.lastExportUrl }), {
      title: 'My Data',
      description: 'This is my data page.',
      styles: ['user']
    })
  })

  user.post('/data/export', async (c) => {
    const { logger, flash, auth, db, api } = c.var
    const user = await auth.getUser()
    if (user == null) throw new HTTPException(401) // this should never happen due to the authorize middleware

    try {
      const url = await api.userData.downloadUserData(user.uid)
      const info: UserProfileInfo = { ...(user.info as UserProfileInfo), lastExportUrl: url }
      await db.updateTable('users').set({ info }).where('id', '=', user.id).execute()
      logger.info({ uid: user.uid }, 'User data export generated')
      await flash.addFlash('success', 'Your data export is ready — the download link is below.')
    } catch (error) {
      if (error instanceof UserDataError) {
        await flash.addFlash('error', error.message)
      } else {
        utils.logError(logger, error, 'Error generating user data export')
        await flash.addFlash('error', 'Something went wrong exporting your data. Please try again.')
      }
    }
    return utils.redirect(c, '/user/data')
  })

  user.post('/data/delete', async (c) => {
    const { logger, flash, auth, api } = c.var
    const user = await auth.getUser()
    if (user == null) throw new HTTPException(401) // this should never happen due to the authorize middleware

    // the modal gates this client-side, but the word is re-checked here so a bare POST can't delete an account
    const formData = await c.req.formData()
    const confirm = String(formData.get('confirm') ?? '')
      .trim()
      .toLowerCase()
    if (confirm !== 'delete') {
      await flash.addFlash('error', 'Please type "delete" to confirm deleting your account.')
      return utils.redirect(c, '/user/data')
    }

    // deletion is irreversible, so a live session alone isn't enough — prove the password too
    // (getUser() deliberately omits passwordHash, so fetch it directly for verification)
    const password = String(formData.get('password') ?? '')
    const credentials = await c.var.db
      .selectFrom('users')
      .select('passwordHash')
      .where('id', '=', user.id)
      .executeTakeFirstOrThrow()
    if (password === '' || !(await Bun.password.verify(password, credentials.passwordHash))) {
      logger.warn({ uid: user.uid }, 'Account deletion rejected: password missing or incorrect')
      await flash.addFlash('error', 'Your password is incorrect. Your account was not deleted.')
      return utils.redirect(c, '/user/data')
    }

    try {
      await api.userData.deleteUserData(user.uid)
    } catch (error) {
      utils.logError(logger, error, 'Error deleting user account')
      await flash.addFlash('error', 'Something went wrong deleting your account. Please try again.')
      return utils.redirect(c, '/user/data')
    }

    logger.info({ uid: user.uid }, 'User account deleted')
    await auth.signOut()
    await flash.addFlash('info', 'Your account and all of your data have been deleted.')
    return utils.redirect(c, '/')
  })

  user.post('/sign-out', async (c) => {
    const { auth, flash } = c.var
    await auth.signOut()
    await flash.addFlash('success', 'You have been signed out.')
    return utils.redirect(c, '/')
  })
}
