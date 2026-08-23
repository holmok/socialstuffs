import { afterAll, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import EmailAPI from '@api/email-api'
import ImagesAPI, { ImageUploadError } from '@api/image-api'
import LanguageAPI from '@api/language-api'
import UserDataAPI, { UserDataError } from '@api/user-data-api'
import type { UserProfileInfo } from '@data/user-data'
import { Hono } from 'hono'
import { getSignedCookie } from 'hono/cookie'
import { verify } from 'hono/jwt'
import normalizeEmail from 'normalize-email'
import pino from 'pino'
import LoadConfig from '@/config'
import { __resetRateLimits } from '@/middleware'
import { createApp } from '@/server'

const config = LoadConfig()
const logger = pino({ level: 'silent' })
const { app, db } = createApp(config, logger)

const suffix = Math.random().toString(36).slice(2, 10)

const PASSWORD = 'Settings99!ok'

// stub Postmark so no real emails are sent; also lets us assert what was sent
const emailSpy = spyOn(EmailAPI.prototype, 'sendEmail').mockResolvedValue(undefined)

// stub the Google-backed APIs so no credentials or network are ever touched
const UPLOADED_URL = 'https://img.example.com/u/profile-test.jpg'
const languageSpy = spyOn(LanguageAPI.prototype, 'getContentFlags').mockResolvedValue([])
const uploadSpy = spyOn(ImagesAPI.prototype, 'uploadImage').mockResolvedValue(UPLOADED_URL)
const EXPORT_URL = 'https://img.example.com/user_data/dt=2026-08-09/test_data.zip'
const exportSpy = spyOn(UserDataAPI.prototype, 'downloadUserData').mockResolvedValue(EXPORT_URL)
const deleteSpy = spyOn(UserDataAPI.prototype, 'deleteUserData').mockResolvedValue(undefined)
// null (= not found) by default; the happy-path test overrides with mockResolvedValueOnce
const downloadSpy = spyOn(UserDataAPI.prototype, 'getExportStream').mockResolvedValue(null)

type SeededUser = { id: number; uid: string; email: string; username: string }

async function seedUser(name: string): Promise<SeededUser> {
  // keep seed names short: username max is 15 chars, so `u${name}` must leave room for the full 8-char random suffix
  const username = `u${name}${suffix}`.slice(0, 15)
  const email = `${name}-${suffix}@example.com`
  const passwordHash = await Bun.password.hash(PASSWORD, { algorithm: 'bcrypt', cost: 10 })
  const row = await db
    .insertInto('users')
    .values({
      uid: `test-${name}-${suffix}`,
      username,
      normalizedUsername: username.toLowerCase(),
      email,
      normalizedEmail: normalizeEmail(email),
      passwordHash
    })
    .returning(['id', 'uid', 'email', 'username'])
    .executeTakeFirstOrThrow()
  // status is not insertable (defaults to 'pending'); flip via update like the other flow tests
  await db.updateTable('users').set({ status: 'active' }).where('id', '=', row.id).execute()
  return row
}

let ipCounter = 0
function post(path: string, fields: Record<string, string>, cookie?: string) {
  ipCounter += 1
  return app.request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // csrf() requires a same-origin signal; request URL origin is http://localhost
      Origin: 'http://localhost',
      // unique per request so the per-IP rate limiter never trips across tests
      'X-Forwarded-For': `10.3.0.${ipCounter}`,
      ...(cookie ? { cookie } : {})
    },
    body: new URLSearchParams(fields).toString()
  })
}

function postMultipart(path: string, fields: Record<string, string | File>, cookie?: string) {
  ipCounter += 1
  const body = new FormData()
  for (const [key, value] of Object.entries(fields)) body.append(key, value)
  return app.request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      Origin: 'http://localhost',
      'X-Forwarded-For': `10.3.1.${ipCounter}`,
      ...(cookie ? { cookie } : {})
    },
    body
  })
}

function get(path: string, cookie?: string, headers: Record<string, string> = {}) {
  return app.request(`http://localhost${path}`, { headers: { ...(cookie ? { cookie } : {}), ...headers } })
}

function authCookie(res: Response): string | undefined {
  return res.headers.getSetCookie().find((s) => s.startsWith(`${config.auth.userCookieName}=`))
}

async function signIn(user: SeededUser): Promise<string> {
  const res = await post('/sign-in', { email: user.email, password: PASSWORD })
  const cookie = authCookie(res)
  if (res.status !== 303 || !cookie) throw new Error('sign-in did not succeed for seeded user')
  return cookie.split(';')[0]
}

// minimal app that unwraps the signed auth cookie and returns the verified JWT claims
const inspect = new Hono()
inspect.get('/claims', async (c) => {
  const token = await getSignedCookie(c, config.auth.cookieSecret, config.auth.userCookieName)
  if (!token) return c.json({ payload: null })
  const payload = await verify(token, config.auth.jwtSecret, 'HS256')
  return c.json({ payload })
})

async function claimsFor(cookie: string): Promise<Record<string, unknown> | null> {
  const res = await inspect.request('/claims', { headers: { cookie } })
  const { payload } = (await res.json()) as { payload: Record<string, unknown> | null }
  return payload
}

// the settings form always posts all five fields; blank password means "keep current password",
// and currentPassword is only required when the email or password changes
function settingsFields(user: { username: string; email: string }, overrides: Record<string, string> = {}) {
  return { username: user.username, email: user.email, currentPassword: '', password: '', confirmPassword: '', ...overrides }
}

beforeEach(() => {
  __resetRateLimits()
  languageSpy.mockClear()
  uploadSpy.mockClear()
  exportSpy.mockClear()
  deleteSpy.mockClear()
  downloadSpy.mockClear()
})

afterAll(async () => {
  const users = await db.selectFrom('users').where('normalizedEmail', 'like', `%${suffix}%`).select(['id']).execute()
  const ids = users.map((u) => u.id)
  if (ids.length > 0) {
    await db.deleteFrom('accountValidationTokens').where('userId', 'in', ids).execute()
    await db.deleteFrom('users').where('id', 'in', ids).execute()
  }
  await db.deleteFrom('kvStorage').where('key', 'like', `sign-in-acct:%${suffix}%`).execute()
  emailSpy.mockRestore()
  languageSpy.mockRestore()
  uploadSpy.mockRestore()
  exportSpy.mockRestore()
  deleteSpy.mockRestore()
  downloadSpy.mockRestore()
  await db.destroy()
})

describe('auth gating on /user', () => {
  test('unauthenticated GET redirects to /sign-in', async () => {
    const res = await get('/user/settings')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/sign-in?next=%2Fuser%2Fsettings')
  })

  test('unauthenticated HTMX GET gets a 401 with HX-Redirect', async () => {
    const res = await get('/user', undefined, { 'HX-Request': 'true' })
    expect(res.status).toBe(401)
    expect(res.headers.get('HX-Redirect')).toBe('/sign-in?next=%2Fuser')
  })

  test('unauthenticated POST /user/settings redirects to /sign-in', async () => {
    const res = await post('/user/settings', { username: 'x', email: 'x@example.com' })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/sign-in')
  })
})

describe('GET /user pages', () => {
  test('/user renders the profile card with stored info and the edit link', async () => {
    const user = await seedUser('prof')
    await db
      .updateTable('users')
      .set({ info: { fullname: 'Pat Profile', title: 'Tester', location: 'Denver', bio: 'Hello there.' } })
      .where('id', '=', user.id)
      .execute()
    const cookie = await signIn(user)

    const res = await get('/user', cookie)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('Pat Profile')
    expect(body).toContain(`@${user.username}`)
    expect(body).toContain('Tester · Denver')
    expect(body).toContain('Hello there.')
    expect(body).toContain('Member since')
    expect(body).toContain('href="/user/edit-profile"')
    expect(body).toContain(`href="/profile/${user.uid}"`)
    // no uploaded photo: avatar falls back to the shared placeholder
    expect(body).toContain('profile.jpg')
  })

  test('/user with no profile info falls back to the username and skips empty sections', async () => {
    const user = await seedUser('bare')
    const cookie = await signIn(user)
    const res = await get('/user', cookie)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain(`@${user.username}`)
    // the CSS class names always appear in the inline <style>; assert on the rendered elements
    expect(body).not.toContain('class="profile-meta"')
    expect(body).not.toContain('class="profile-bio"')
  })

  test('/user/settings pre-fills the current username and email', async () => {
    const user = await seedUser('pre')
    const cookie = await signIn(user)
    const res = await get('/user/settings', cookie)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain(user.username)
    expect(body).toContain(user.email)
  })
})

describe('POST /user/settings — validation', () => {
  test('invalid username re-renders the form with the field error', async () => {
    const user = await seedUser('badname')
    const cookie = await signIn(user)
    const res = await post('/user/settings', settingsFields(user, { username: '_bad' }), cookie)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('hx-post="/user/settings"')
    expect(body).toContain('Username cannot start with an underscore.')
  })

  test('mismatched new passwords re-render the form with the error', async () => {
    const user = await seedUser('pwmis')
    const cookie = await signIn(user)
    const res = await post(
      '/user/settings',
      settingsFields(user, { password: 'NewPass88#ok', confirmPassword: 'Different88#ok' }),
      cookie
    )
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Passwords do not match.')
  })
})

describe('POST /user/settings — no changes', () => {
  test('submitting current values with a blank password redirects without touching the account', async () => {
    const user = await seedUser('same')
    const cookie = await signIn(user)
    const before = emailSpy.mock.calls.length

    const res = await post('/user/settings', settingsFields(user), cookie)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/user/settings')

    const row = await db
      .selectFrom('users')
      .select(['username', 'email', 'status'])
      .where('id', '=', user.id)
      .executeTakeFirstOrThrow()
    expect(row).toEqual({ username: user.username, email: user.email, status: 'active' })
    expect(emailSpy.mock.calls.length).toBe(before)
  })
})

describe('POST /user/settings — username change', () => {
  test('updates the row and re-signs the JWT with the new username', async () => {
    const user = await seedUser('rename')
    const cookie = await signIn(user)
    const newUsername = `nu${suffix}`

    const res = await post('/user/settings', settingsFields(user, { username: newUsername }), cookie)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/user/settings')

    const row = await db
      .selectFrom('users')
      .select(['username', 'normalizedUsername'])
      .where('id', '=', user.id)
      .executeTakeFirstOrThrow()
    expect(row.username).toBe(newUsername)
    expect(row.normalizedUsername).toBe(newUsername.toLowerCase())

    // the response re-signs the auth cookie so the session's username claim is current
    const newCookie = authCookie(res)
    expect(newCookie).toBeDefined()
    const claims = await claimsFor((newCookie as string).split(';')[0])
    expect(claims?.username).toBe(newUsername)
  })

  test('a username already in use is rejected without changing the row', async () => {
    const user = await seedUser('utaken')
    const other = await seedUser('uheld')
    const cookie = await signIn(user)

    const res = await post('/user/settings', settingsFields(user, { username: other.username }), cookie)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Username is already in use.')

    const row = await db.selectFrom('users').select(['username']).where('id', '=', user.id).executeTakeFirstOrThrow()
    expect(row.username).toBe(user.username)
  })

  test('a case-only change of your own username is allowed (in-use check excludes your row)', async () => {
    const user = await seedUser('ucase')
    const cookie = await signIn(user)
    const newUsername = user.username.toUpperCase()
    expect(newUsername).not.toBe(user.username)

    const res = await post('/user/settings', settingsFields(user, { username: newUsername }), cookie)
    expect(res.status).toBe(303)

    const row = await db
      .selectFrom('users')
      .select(['username', 'normalizedUsername'])
      .where('id', '=', user.id)
      .executeTakeFirstOrThrow()
    expect(row.username).toBe(newUsername)
    expect(row.normalizedUsername).toBe(user.username.toLowerCase())
  })
})

describe('POST /user/settings — current-password gate', () => {
  test('an email change without the current password is rejected', async () => {
    const user = await seedUser('gnopw')
    const cookie = await signIn(user)

    const res = await post('/user/settings', settingsFields(user, { email: `gnopw-new-${suffix}@example.com` }), cookie)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Enter your current password to change your email or password.')

    const row = await db.selectFrom('users').select(['email', 'status']).where('id', '=', user.id).executeTakeFirstOrThrow()
    expect(row.email).toBe(user.email)
    expect(row.status).toBe('active')
  })

  test('a password change with the wrong current password is rejected', async () => {
    const user = await seedUser('gbadpw')
    const cookie = await signIn(user)
    const before = await db.selectFrom('users').select(['passwordHash']).where('id', '=', user.id).executeTakeFirstOrThrow()

    const res = await post(
      '/user/settings',
      settingsFields(user, { currentPassword: 'Wrong99#pass', password: 'NewPass88#ok', confirmPassword: 'NewPass88#ok' }),
      cookie
    )
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Your current password is incorrect.')

    const after = await db.selectFrom('users').select(['passwordHash']).where('id', '=', user.id).executeTakeFirstOrThrow()
    expect(after.passwordHash).toBe(before.passwordHash)
  })
})

describe('POST /user/settings — password change', () => {
  test('rotates pwv, invalidates the old session cookie, and the new password signs in', async () => {
    const user = await seedUser('repw')
    const cookie = await signIn(user)
    const oldClaims = await claimsFor(cookie)
    const NEW_PASSWORD = 'NewPass88#ok'

    const res = await post(
      '/user/settings',
      settingsFields(user, { currentPassword: PASSWORD, password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }),
      cookie
    )
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/user/settings')

    // the response carries a re-signed cookie with the new password fingerprint
    const newCookie = (authCookie(res) as string).split(';')[0]
    const newClaims = await claimsFor(newCookie)
    expect(newClaims?.pwv).toBeDefined()
    expect(newClaims?.pwv).not.toBe(oldClaims?.pwv)

    // the re-signed session keeps working; the stale pre-change cookie is revoked by the pwv check
    expect((await get('/user/settings', newCookie)).status).toBe(200)
    const stale = await get('/user/settings', cookie)
    expect(stale.status).toBe(302)
    expect(stale.headers.get('location')).toBe('/sign-in?next=%2Fuser%2Fsettings')

    // the revocation 401 path (signOut inside authorize(), then the thrown HTTPException) still
    // delivers the cookies set before the throw: a rotated session cookie plus the flash marker,
    // so the sign-in page the user lands on shows the notice
    const staleSetCookies = stale.headers.getSetCookie()
    expect(staleSetCookies.some((s) => s.startsWith(`${config.auth.sessionCookieName}=`))).toBe(true)
    expect(staleSetCookies.some((s) => s.startsWith(`${config.auth.sessionCookieName}_f=1`))).toBe(true)
    // emulate a browser jar: last Set-Cookie wins per name, Max-Age=0 drops the cookie
    const jar = new Map<string, string>()
    for (const s of staleSetCookies) {
      const [pair] = s.split(';')
      const eq = pair.indexOf('=')
      if (s.includes('Max-Age=0')) jar.delete(pair.slice(0, eq))
      else jar.set(pair.slice(0, eq), pair.slice(eq + 1))
    }
    const signInPage = await get('/sign-in?next=%2Fuser%2Fsettings', [...jar].map(([k, v]) => `${k}=${v}`).join('; '))
    expect(signInPage.status).toBe(200)
    expect(await signInPage.text()).toContain('You must be signed in to access that page.')

    // old password no longer signs in, new one does
    const oldPw = await post('/sign-in', { email: user.email, password: PASSWORD })
    expect(await oldPw.text()).toContain('Invalid sign in.')
    const newPw = await post('/sign-in', { email: user.email, password: NEW_PASSWORD })
    expect(newPw.status).toBe(303)
  })
})

describe('POST /user/settings — email change', () => {
  test('an email already in use is rejected without changing the row', async () => {
    const user = await seedUser('etaken')
    const other = await seedUser('eheld')
    const cookie = await signIn(user)

    const res = await post('/user/settings', settingsFields(user, { email: other.email, currentPassword: PASSWORD }), cookie)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Email is already in use.')

    const row = await db.selectFrom('users').select(['email', 'status']).where('id', '=', user.id).executeTakeFirstOrThrow()
    expect(row.email).toBe(user.email)
    expect(row.status).toBe('active')
  })

  test('a new email flips the account to pending, signs the user out, creates a token, and sends both emails', async () => {
    const user = await seedUser('remail')
    const cookie = await signIn(user)
    const newEmail = `remail-new-${suffix}@example.com`
    const before = emailSpy.mock.calls.length

    const res = await post('/user/settings', settingsFields(user, { email: newEmail, currentPassword: PASSWORD }), cookie)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/sign-in')
    // the response clears the auth cookie (signed out until the new address is verified)
    expect(authCookie(res)).toContain('Max-Age=0')

    const row = await db
      .selectFrom('users')
      .select(['email', 'normalizedEmail', 'status'])
      .where('id', '=', user.id)
      .executeTakeFirstOrThrow()
    expect(row.status).toBe('pending')
    expect(row.email).toBe(newEmail)
    expect(row.normalizedEmail).toBe(normalizeEmail(newEmail))

    const tokens = await db.selectFrom('accountValidationTokens').select(['id']).where('userId', '=', user.id).execute()
    expect(tokens.length).toBe(1)

    // validation link to the new address, courtesy notice to the old one
    expect(emailSpy.mock.calls.length).toBe(before + 2)
    const [validation] = emailSpy.mock.calls[before] as [{ to: string; template: string }]
    const [notice] = emailSpy.mock.calls[before + 1] as [{ to: string; template: string }]
    expect(validation.to).toBe(newEmail)
    expect(validation.template).toBe('email-change-validation-email')
    expect(notice.to).toBe(user.email)
    expect(notice.template).toBe('email-change-notice-email')

    // the old session no longer grants access (account is pending)
    const stale = await get('/user/settings', cookie)
    expect(stale.status).toBe(302)
    expect(stale.headers.get('location')).toBe('/sign-in?next=%2Fuser%2Fsettings')
  })

  test('a validation-email send failure is non-fatal: account is still pending with a token', async () => {
    const user = await seedUser('emfail')
    const cookie = await signIn(user)
    const newEmail = `emfail-new-${suffix}@example.com`
    emailSpy.mockRejectedValueOnce(new Error('postmark down'))

    const res = await post('/user/settings', settingsFields(user, { email: newEmail, currentPassword: PASSWORD }), cookie)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/sign-in')

    const row = await db.selectFrom('users').select(['status', 'email']).where('id', '=', user.id).executeTakeFirstOrThrow()
    expect(row.status).toBe('pending')
    expect(row.email).toBe(newEmail)

    const tokens = await db.selectFrom('accountValidationTokens').select(['id']).where('userId', '=', user.id).execute()
    expect(tokens.length).toBe(1)
  })
})

async function profileInfo(userId: number): Promise<UserProfileInfo> {
  const row = await db.selectFrom('users').select(['info']).where('id', '=', userId).executeTakeFirstOrThrow()
  return row.info
}

const PROFILE_FIELDS = { fullname: 'Chris Example', title: 'Builder', location: 'Portland', bio: 'I make things.' }

describe('GET /user/edit-profile', () => {
  test('pre-fills the stored profile info', async () => {
    const user = await seedUser('epget')
    await db.updateTable('users').set({ info: PROFILE_FIELDS }).where('id', '=', user.id).execute()
    const cookie = await signIn(user)

    const res = await get('/user/edit-profile', cookie)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('Chris Example')
    expect(body).toContain('I make things.')
    // no uploaded photo yet: the preview falls back to the shared placeholder image
    expect(body).toContain('profile.jpg')
  })
})

describe('POST /user/edit-profile — text fields', () => {
  test('clean text is moderated per field and saved to the info JSON', async () => {
    const user = await seedUser('epsave')
    const cookie = await signIn(user)

    const res = await post('/user/edit-profile', PROFILE_FIELDS, cookie)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/user/edit-profile')

    expect(await profileInfo(user.id)).toEqual(PROFILE_FIELDS)
    // one moderation call per non-empty field
    expect(languageSpy.mock.calls.length).toBe(4)
    expect(uploadSpy.mock.calls.length).toBe(0)
  })

  test('blank fields clear stored values and skip moderation', async () => {
    const user = await seedUser('epclear')
    await db.updateTable('users').set({ info: PROFILE_FIELDS }).where('id', '=', user.id).execute()
    const cookie = await signIn(user)

    const res = await post('/user/edit-profile', { fullname: '', title: '', location: '', bio: '' }, cookie)
    expect(res.status).toBe(303)

    expect(await profileInfo(user.id)).toEqual({})
    expect(languageSpy.mock.calls.length).toBe(0)
  })

  test('a too-long field re-renders with the validation error before any moderation', async () => {
    const user = await seedUser('eplong')
    const cookie = await signIn(user)

    const res = await post('/user/edit-profile', { ...PROFILE_FIELDS, fullname: 'x'.repeat(101) }, cookie)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Full name must be at most 100 characters long.')
    expect(languageSpy.mock.calls.length).toBe(0)
    expect(await profileInfo(user.id)).toEqual({})
  })

  test('a bio over 500 characters re-renders with the length error', async () => {
    const user = await seedUser('epbio')
    const cookie = await signIn(user)

    const res = await post('/user/edit-profile', { ...PROFILE_FIELDS, bio: 'x'.repeat(501) }, cookie)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Bio must be at most 500 characters long.')
    expect(await profileInfo(user.id)).toEqual({})
  })

  test('flagged text re-renders with a field error and nothing is saved', async () => {
    const user = await seedUser('epflag')
    const cookie = await signIn(user)
    languageSpy.mockResolvedValueOnce(['Insult'])

    const res = await post('/user/edit-profile', { fullname: '', title: '', location: '', bio: 'rude text' }, cookie)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('This text appears to contain inappropriate content.')
    expect(await profileInfo(user.id)).toEqual({})
  })

  test('a moderation outage fails closed with a form-level error', async () => {
    const user = await seedUser('epdown')
    const cookie = await signIn(user)
    languageSpy.mockRejectedValueOnce(new Error('Failed to moderate content'))

    const res = await post('/user/edit-profile', { fullname: '', title: '', location: '', bio: 'anything' }, cookie)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('check your text right now')
    expect(await profileInfo(user.id)).toEqual({})
  })
})

describe('POST /user/edit-profile — profile image', () => {
  const imageFile = () => new File([new Uint8Array([1, 2, 3])], 'me.jpg', { type: 'image/jpeg' })

  test('uploads with a fresh profile- filename and stores the returned URL', async () => {
    const user = await seedUser('epimg')
    const cookie = await signIn(user)

    const res = await postMultipart('/user/edit-profile', { ...PROFILE_FIELDS, image: imageFile() }, cookie)
    expect(res.status).toBe(303)

    expect(await profileInfo(user.id)).toEqual({ ...PROFILE_FIELDS, profileImageUrl: UPLOADED_URL })
    expect(uploadSpy.mock.calls.length).toBe(1)
    const [options] = uploadSpy.mock.calls[0] as [
      { userUid: string; filename: string; mimetype: string; maxDimension: number; removePrefix?: string }
    ]
    expect(options.userUid).toBe(user.uid)
    expect(options.filename).toStartWith('profile-')
    expect(options.mimetype).toBe('image/jpeg')
    expect(options.maxDimension).toBe(512)
    expect(options.removePrefix).toBe('profile')
  })

  test('an image over 20MB re-renders with the size error without calling the upload API', async () => {
    const user = await seedUser('epbig')
    const cookie = await signIn(user)
    const big = new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' })

    const res = await postMultipart('/user/edit-profile', { ...PROFILE_FIELDS, image: big }, cookie)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Image is too large. The maximum size is 20MB.')
    expect(uploadSpy.mock.calls.length).toBe(0)
    expect(await profileInfo(user.id)).toEqual({})
  })

  test('a non-image file type re-renders with the type error without calling the upload API', async () => {
    const user = await seedUser('eptype')
    const cookie = await signIn(user)
    const pdf = new File([new Uint8Array([1, 2, 3])], 'resume.pdf', { type: 'application/pdf' })

    const res = await postMultipart('/user/edit-profile', { ...PROFILE_FIELDS, image: pdf }, cookie)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Image must be a JPEG, PNG, or GIF.')
    expect(uploadSpy.mock.calls.length).toBe(0)
    expect(await profileInfo(user.id)).toEqual({})
  })

  test('a rejected image re-renders with the image error and nothing is saved', async () => {
    const user = await seedUser('epbad')
    const cookie = await signIn(user)
    uploadSpy.mockRejectedValueOnce(
      new ImageUploadError('Image contains unacceptable content and cannot be uploaded.', {
        image: ['Image contains unacceptable content and cannot be uploaded.']
      })
    )

    const res = await postMultipart('/user/edit-profile', { ...PROFILE_FIELDS, image: imageFile() }, cookie)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Image contains unacceptable content and cannot be uploaded.')
    expect(await profileInfo(user.id)).toEqual({})
  })

  test('submitting without a file keeps the existing stored image URL', async () => {
    const user = await seedUser('epkeep')
    const kept = 'https://img.example.com/u/profile-kept.jpg'
    await db
      .updateTable('users')
      .set({ info: { profileImageUrl: kept } })
      .where('id', '=', user.id)
      .execute()
    const cookie = await signIn(user)

    const res = await post('/user/edit-profile', PROFILE_FIELDS, cookie)
    expect(res.status).toBe(303)
    expect(uploadSpy.mock.calls.length).toBe(0)
    expect(await profileInfo(user.id)).toEqual({ ...PROFILE_FIELDS, profileImageUrl: kept })
  })
})

describe('GET /user/data', () => {
  test('shows the export and delete sections, without an export link before any export', async () => {
    const user = await seedUser('dpage')
    const cookie = await signIn(user)
    const res = await get('/user/data', cookie)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('Generate Your Data Export')
    expect(body).toContain('Delete My Account')
    expect(body).not.toContain('Download your latest export')
  })

  test('shows the stored export link when one exists', async () => {
    const user = await seedUser('dlink')
    await db
      .updateTable('users')
      .set({ info: { lastExportUrl: EXPORT_URL } })
      .where('id', '=', user.id)
      .execute()
    const cookie = await signIn(user)
    const body = await (await get('/user/data', cookie)).text()
    expect(body).toContain('Download your latest export')
    expect(body).toContain(`href="${EXPORT_URL}"`)
    // the date is derived from the dt= segment of the stored URL, as plain text after the link
    expect(body).toContain('</a> created on 08/09/2026')
  })
})

describe('GET /user/data/user_data/:dt/:file (export download)', () => {
  const DT = 'dt=2026-08-09'

  test("streams the user's own export with download headers", async () => {
    const user = await seedUser('ddl')
    const cookie = await signIn(user)
    downloadSpy.mockResolvedValueOnce({
      stream: new Response('zip-bytes').body as ReadableStream<Uint8Array>,
      size: 9
    })

    const res = await get(`/user/data/user_data/${DT}/token123_${user.uid}_data.zip`, cookie)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/zip')
    expect(res.headers.get('content-length')).toBe('9')
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="socialstuffs-data-2026-08-09.zip"')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.text()).toBe('zip-bytes')
    expect(downloadSpy.mock.calls).toEqual([[user.uid, `user_data/${DT}/token123_${user.uid}_data.zip`]])
  })

  test("404s a filename carrying another user's uid without touching storage", async () => {
    const user = await seedUser('ddla')
    const other = await seedUser('ddlb')
    const cookie = await signIn(user)

    const res = await get(`/user/data/user_data/${DT}/token123_${other.uid}_data.zip`, cookie)
    expect(res.status).toBe(404)
    expect(downloadSpy.mock.calls.length).toBe(0)
  })

  test('404s malformed date and filename segments without touching storage', async () => {
    const user = await seedUser('ddlm')
    const cookie = await signIn(user)

    const badDt = await get(`/user/data/user_data/dt=20260809/token123_${user.uid}_data.zip`, cookie)
    expect(badDt.status).toBe(404)
    // %2e%2e = `..` — decoded traversal characters must not reach the storage path
    const traversal = await get(`/user/data/user_data/${DT}/%2e%2e_${user.uid}_data.zip`, cookie)
    expect(traversal.status).toBe(404)
    expect(downloadSpy.mock.calls.length).toBe(0)
  })

  test('404s when the object is gone from the bucket', async () => {
    const user = await seedUser('ddlg')
    const cookie = await signIn(user)

    // default stub resolves null (not found / not yours)
    const res = await get(`/user/data/user_data/${DT}/token123_${user.uid}_data.zip`, cookie)
    expect(res.status).toBe(404)
    expect(downloadSpy.mock.calls.length).toBe(1)
  })

  test('redirects to sign-in when not authenticated', async () => {
    const res = await get(`/user/data/user_data/${DT}/token123_someuid_data.zip`)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('/sign-in')
    expect(downloadSpy.mock.calls.length).toBe(0)
  })
})

describe('POST /user/data/export', () => {
  test('generates the export and stores the URL in the info JSON', async () => {
    const user = await seedUser('dexp')
    await db
      .updateTable('users')
      .set({ info: { fullname: 'Keep Me' } })
      .where('id', '=', user.id)
      .execute()
    const cookie = await signIn(user)

    const res = await post('/user/data/export', {}, cookie)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/user/data')

    expect(exportSpy.mock.calls).toEqual([[user.uid]])
    // the URL is merged into info without clobbering existing profile fields
    expect(await profileInfo(user.id)).toEqual({ fullname: 'Keep Me', lastExportUrl: EXPORT_URL })
  })

  test('a UserDataError (already exported today) redirects back without touching the info JSON', async () => {
    const user = await seedUser('dexp2')
    const cookie = await signIn(user)
    exportSpy.mockRejectedValueOnce(
      new UserDataError('You already exported your data today. You can only do it once a day.', {
        export: ['You already exported your data today. You can only do it once a day.']
      })
    )

    const res = await post('/user/data/export', {}, cookie)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/user/data')
    expect(await profileInfo(user.id)).toEqual({})
  })
})

describe('POST /user/data/delete', () => {
  test('requires the word "delete" — anything else redirects back without deleting', async () => {
    const user = await seedUser('dnope')
    const cookie = await signIn(user)

    const res = await post('/user/data/delete', { confirm: 'nope' }, cookie)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/user/data')
    expect(deleteSpy.mock.calls.length).toBe(0)
    expect(await db.selectFrom('users').select('id').where('id', '=', user.id).executeTakeFirst()).toBeDefined()
  })

  test('a wrong password redirects back without deleting', async () => {
    const user = await seedUser('dbadpw')
    const cookie = await signIn(user)

    const res = await post('/user/data/delete', { confirm: 'delete', password: 'Wrong99#pass' }, cookie)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/user/data')
    expect(deleteSpy.mock.calls.length).toBe(0)
    expect(await db.selectFrom('users').select('id').where('id', '=', user.id).executeTakeFirst()).toBeDefined()
  })

  test('typing "delete" with the correct password deletes the account, signs the user out, and redirects home', async () => {
    const user = await seedUser('dyes')
    const cookie = await signIn(user)

    const res = await post('/user/data/delete', { confirm: ' Delete ', password: PASSWORD }, cookie)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/')
    expect(deleteSpy.mock.calls).toEqual([[user.uid]])
    expect(authCookie(res)).toContain('Max-Age=0')
  })

  test('a deletion failure redirects back with the account intact', async () => {
    const user = await seedUser('dfail')
    const cookie = await signIn(user)
    deleteSpy.mockRejectedValueOnce(new Error('gcs down'))

    const res = await post('/user/data/delete', { confirm: 'delete', password: PASSWORD }, cookie)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/user/data')
    // not signed out on failure
    expect(authCookie(res)).toBeUndefined()
  })
})

describe('POST /user/sign-out', () => {
  test('clears the auth cookie and redirects home', async () => {
    const user = await seedUser('bye')
    const cookie = await signIn(user)

    const res = await post('/user/sign-out', {}, cookie)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/')
    expect(authCookie(res)).toContain('Max-Age=0')
  })
})
