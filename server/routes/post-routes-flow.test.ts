import { afterAll, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import ImagesAPI, { ImageUploadError } from '@api/image-api'
import LanguageAPI from '@api/language-api'
import normalizeEmail from 'normalize-email'
import pino from 'pino'
import LoadConfig from '@/config'
import { __resetRateLimits } from '@/middleware'
import { createApp } from '@/server'

const config = LoadConfig()
const logger = pino({ level: 'silent' })
const { app, db } = createApp(config, logger)

const suffix = Math.random().toString(36).slice(2, 10)

const PASSWORD = 'NewPost99!ok'

// stub the Google-backed APIs so no credentials or network are ever touched
const UPLOADED_URL = 'https://img.example.com/u/post-test.jpg'
const languageSpy = spyOn(LanguageAPI.prototype, 'getContentFlags').mockResolvedValue([])
const uploadSpy = spyOn(ImagesAPI.prototype, 'uploadImage').mockResolvedValue(UPLOADED_URL)

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
function postMultipart(
  path: string,
  fields: Record<string, string | File>,
  cookie?: string,
  headers: Record<string, string> = {}
) {
  ipCounter += 1
  const body = new FormData()
  for (const [key, value] of Object.entries(fields)) body.append(key, value)
  return app.request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      // csrf() requires a same-origin signal; request URL origin is http://localhost
      Origin: 'http://localhost',
      // unique per request so the per-IP rate limiter never trips across tests
      'X-Forwarded-For': `10.5.0.${ipCounter}`,
      ...(cookie ? { cookie } : {}),
      ...headers
    },
    body
  })
}

function get(path: string, cookie?: string) {
  return app.request(`http://localhost${path}`, { headers: cookie ? { cookie } : {} })
}

async function signIn(user: SeededUser): Promise<string> {
  ipCounter += 1
  const res = await app.request('http://localhost/sign-in', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: 'http://localhost',
      'X-Forwarded-For': `10.5.1.${ipCounter}`
    },
    body: new URLSearchParams({ email: user.email, password: PASSWORD }).toString()
  })
  const cookie = res.headers.getSetCookie().find((s) => s.startsWith(`${config.auth.userCookieName}=`))
  if (res.status !== 303 || !cookie) throw new Error('sign-in did not succeed for seeded user')
  return cookie.split(';')[0]
}

// the form always posts every field; override per test
function postFields(overrides: Record<string, string | File> = {}) {
  return { content: `hello-${suffix}`, linkUrl: '', linkText: '', status: 'published', audience: 'all', ...overrides }
}

function postsFor(userId: number) {
  return db
    .selectFrom('posts')
    .select(['id', 'uid', 'content', 'imageUrl', 'linkUrl', 'linkText', 'status'])
    .where('userId', '=', userId)
    .execute()
}

beforeEach(() => {
  __resetRateLimits()
  languageSpy.mockClear()
  uploadSpy.mockClear()
})

afterAll(async () => {
  const users = await db.selectFrom('users').where('normalizedEmail', 'like', `%${suffix}%`).select(['id']).execute()
  const ids = users.map((u) => u.id)
  if (ids.length > 0) {
    await db.deleteFrom('postTargets').where('userId', 'in', ids).execute()
    await db.deleteFrom('posts').where('userId', 'in', ids).execute()
    await db.deleteFrom('users').where('id', 'in', ids).execute()
  }
  languageSpy.mockRestore()
  uploadSpy.mockRestore()
  await db.destroy()
})

describe('auth gating on /posts', () => {
  test('unauthenticated GET /posts/new redirects to /sign-in', async () => {
    const res = await get('/posts/new')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/sign-in')
  })
})

describe('GET /posts/new', () => {
  test('renders the form with all fields and defaults', async () => {
    const user = await seedUser('nform')
    const cookie = await signIn(user)
    const res = await get('/posts/new', cookie)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('hx-post="/posts/new"')
    expect(body).toContain('name="content"')
    expect(body).toContain('name="image"')
    // the file input drives the hidden preview via image-preview.js
    expect(body).toContain('data-preview="post-image-preview"')
    expect(body).toContain('id="post-image-preview"')
    expect(body).toContain('name="linkUrl"')
    expect(body).toContain('name="linkText"')
    expect(body).toContain('name="audience"')
    expect(body).toContain('name="status"')
    expect(body).toContain('<option value="all" selected="">')
    expect(body).toContain('<option value="published" selected="">')
    // archive/delete are edit-only statuses
    expect(body).not.toContain('value="archived"')
    expect(body).not.toContain('value="deleted"')
    // the live character counter starts at zero for an empty form
    expect(body).toContain('id="content-char-count"')
    expect(body).toContain('0/500 characters')
  })
})

describe('POST /posts/new — create', () => {
  test('publishes a post with its audience row and redirects to the profile', async () => {
    const user = await seedUser('npub')
    const cookie = await signIn(user)

    const res = await postMultipart('/posts/new', postFields({ audience: 'approved' }), cookie)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe(`/profile/${user.uid}`)

    const rows = await postsFor(user.id)
    expect(rows.length).toBe(1)
    expect(rows[0].content).toBe(`hello-${suffix}`)
    expect(rows[0].status).toBe('published')
    expect(rows[0].uid).toBeTruthy()

    const target = await db
      .selectFrom('postTargets')
      .select(['postUid', 'type'])
      .where('postId', '=', rows[0].id)
      .executeTakeFirstOrThrow()
    expect(target.type).toBe('approved')
    expect(target.postUid).toBe(rows[0].uid)

    // the published post shows on the profile page with a relative timestamp and no edited marker
    const profile = await (await get(`/profile/${user.uid}`, cookie)).text()
    expect(profile).toContain(`hello-${suffix}`)
    expect(profile).toContain('ago')
    expect(profile).not.toContain('(edited)')
  })

  test('a draft is saved and listed on your own profile with its status', async () => {
    const user = await seedUser('ndft')
    const cookie = await signIn(user)

    const res = await postMultipart('/posts/new', postFields({ content: `drafty-${suffix}`, status: 'draft' }), cookie)
    expect(res.status).toBe(303)

    const rows = await postsFor(user.id)
    expect(rows[0].status).toBe('draft')

    const profile = await (await get(`/profile/${user.uid}`, cookie)).text()
    expect(profile).toContain(`drafty-${suffix}`)
    expect(profile).toContain('· draft')
  })

  test('link url and text are stored and rendered on the profile', async () => {
    const user = await seedUser('nlink')
    const cookie = await signIn(user)

    const res = await postMultipart(
      '/posts/new',
      postFields({ linkUrl: 'https://example.com/read', linkText: 'Read this' }),
      cookie
    )
    expect(res.status).toBe(303)

    const rows = await postsFor(user.id)
    expect(rows[0].linkUrl).toBe('https://example.com/read')
    expect(rows[0].linkText).toBe('Read this')

    const profile = await (await get(`/profile/${user.uid}`, cookie)).text()
    expect(profile).toContain('href="https://example.com/read"')
    expect(profile).toContain('Read this')
  })

  test('an image is uploaded with a post- filename and its URL stored', async () => {
    const user = await seedUser('nimg')
    const cookie = await signIn(user)
    const image = new File([new Uint8Array([1, 2, 3])], 'pic.jpg', { type: 'image/jpeg' })

    const res = await postMultipart('/posts/new', postFields({ image }), cookie)
    expect(res.status).toBe(303)

    expect(uploadSpy.mock.calls.length).toBe(1)
    const [options] = uploadSpy.mock.calls[0] as [{ userUid: string; filename: string; maxDimension: number }]
    expect(options.userUid).toBe(user.uid)
    expect(options.filename).toStartWith('post-')
    expect(options.maxDimension).toBe(1280)

    const rows = await postsFor(user.id)
    expect(rows[0].imageUrl).toBe(UPLOADED_URL)

    // on the profile the image is wrapped in a lightbox link to the full-size file
    const profile = await (await get(`/profile/${user.uid}`, cookie)).text()
    expect(profile).toContain(`href="${UPLOADED_URL}" data-lightbox`)
  })
})

describe('POST /posts/new — validation and moderation', () => {
  test('empty content re-renders the form with the error before moderation', async () => {
    const user = await seedUser('nempty')
    const cookie = await signIn(user)

    const res = await postMultipart('/posts/new', postFields({ content: '   ' }), cookie)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Post text is required.')
    expect(languageSpy.mock.calls.length).toBe(0)
    expect((await postsFor(user.id)).length).toBe(0)
  })

  test('content over 500 characters re-renders with the length error', async () => {
    const user = await seedUser('nlong')
    const cookie = await signIn(user)

    const res = await postMultipart('/posts/new', postFields({ content: 'x'.repeat(501) }), cookie)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Post text must be at most 500 characters long.')
    expect((await postsFor(user.id)).length).toBe(0)
  })

  test('an invalid link URL re-renders with the field error', async () => {
    const user = await seedUser('nbadurl')
    const cookie = await signIn(user)

    const res = await postMultipart('/posts/new', postFields({ linkUrl: 'not-a-url' }), cookie)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Link URL must be a valid http or https URL.')
    expect((await postsFor(user.id)).length).toBe(0)
  })

  test('javascript: and data: link URLs are rejected', async () => {
    const user = await seedUser('nxss')
    const cookie = await signIn(user)

    for (const linkUrl of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>']) {
      const res = await postMultipart('/posts/new', postFields({ linkUrl }), cookie)
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('Link URL must be a valid http or https URL.')
    }
    expect((await postsFor(user.id)).length).toBe(0)
  })

  test('flagged text re-renders with a field error and nothing is saved', async () => {
    const user = await seedUser('nflag')
    const cookie = await signIn(user)
    languageSpy.mockResolvedValueOnce(['Insult'])

    const res = await postMultipart('/posts/new', postFields({ content: 'rude text' }), cookie)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('This text appears to contain inappropriate content.')
    expect((await postsFor(user.id)).length).toBe(0)
  })

  test('a moderation outage fails closed with a form-level error', async () => {
    const user = await seedUser('ndown')
    const cookie = await signIn(user)
    languageSpy.mockRejectedValueOnce(new Error('language API down'))

    const res = await postMultipart('/posts/new', postFields(), cookie)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('check your text right now')
    expect((await postsFor(user.id)).length).toBe(0)
  })

  test('a rejected image re-renders with the image error and nothing is saved', async () => {
    const user = await seedUser('nbadimg')
    const cookie = await signIn(user)
    uploadSpy.mockRejectedValueOnce(
      new ImageUploadError('Image contains unacceptable content and cannot be uploaded.', {
        image: ['Image contains unacceptable content and cannot be uploaded.']
      })
    )
    const image = new File([new Uint8Array([1, 2, 3])], 'pic.jpg', { type: 'image/jpeg' })

    const res = await postMultipart('/posts/new', postFields({ image }), cookie)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Image contains unacceptable content and cannot be uploaded.')
    expect((await postsFor(user.id)).length).toBe(0)
  })

  test('a non-image failure that included a photo shows the re-select note on the full no-JS page', async () => {
    const user = await seedUser('nnote')
    const cookie = await signIn(user)
    const image = new File([new Uint8Array([1, 2, 3])], 'pic.jpg', { type: 'image/jpeg' })

    const res = await postMultipart('/posts/new', postFields({ content: 'x'.repeat(501), image }), cookie)
    expect(res.status).toBe(200)
    const body = await res.text()
    // plain (no-JS) submit: the error re-render is the full styled page, not a bare fragment
    expect(body).toContain('<title>')
    expect(body).toContain('Post text must be at most 500 characters long.')
    // the picked file can't be restored into the re-rendered form, so the user is told
    expect(body).toContain('Your photo needs to be re-selected.')
    expect(uploadSpy.mock.calls.length).toBe(0)
  })

  test('an image-field failure does not show the re-select note', async () => {
    const user = await seedUser('nnoimg')
    const cookie = await signIn(user)
    const image = new File([new Uint8Array([1, 2, 3])], 'pic.txt', { type: 'text/plain' })

    const res = await postMultipart('/posts/new', postFields({ image }), cookie)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('Image must be a JPEG, PNG, or GIF.')
    expect(body).not.toContain('Your photo needs to be re-selected.')
  })

  test('an HTMX submit still gets just the form fragment on error', async () => {
    const user = await seedUser('nhx')
    const cookie = await signIn(user)

    const res = await postMultipart('/posts/new', postFields({ content: '   ' }), cookie, { 'HX-Request': 'true' })
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('Post text is required.')
    expect(body).not.toContain('<title>')
  })
})

// creates a post through the real route and returns its stored row
async function createPost(cookie: string, userId: number, overrides: Record<string, string | File> = {}) {
  const res = await postMultipart('/posts/new', postFields(overrides), cookie)
  if (res.status !== 303) throw new Error('post creation did not succeed')
  const rows = await postsFor(userId)
  return rows[rows.length - 1]
}

describe('GET /posts/:uid/edit', () => {
  test('pre-fills the form from the stored post and its audience', async () => {
    const user = await seedUser('eget')
    const cookie = await signIn(user)
    const post = await createPost(cookie, user.id, {
      content: `editable-${suffix}`,
      linkUrl: 'https://example.com/old',
      linkText: 'Old link',
      status: 'draft',
      audience: 'favorites'
    })

    const res = await get(`/posts/${post.uid}/edit`, cookie)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain(`hx-post="/posts/${post.uid}/edit"`)
    expect(body).toContain(`editable-${suffix}`)
    expect(body).toContain('value="https://example.com/old"')
    expect(body).toContain('value="Old link"')
    expect(body).toContain('<option value="favorites" selected="">')
    expect(body).toContain('<option value="draft" selected="">')
    expect(body).toContain('Save Post')
    // deletion is a confirmed control, not a status option
    expect(body).not.toContain('value="deleted"')
    expect(body).toContain('data-modal-open="post-delete-modal"')
    expect(body).toContain(`action="/posts/${post.uid}/delete"`)
  })

  test("someone else's post is a 404", async () => {
    const owner = await seedUser('eown')
    const intruder = await seedUser('eint')
    const ownerCookie = await signIn(owner)
    const post = await createPost(ownerCookie, owner.id)

    const intruderCookie = await signIn(intruder)
    const res = await get(`/posts/${post.uid}/edit`, intruderCookie)
    expect(res.status).toBe(404)
  })
})

describe('POST /posts/:uid/edit', () => {
  test('updates the fields and the audience row, then redirects to the profile', async () => {
    const user = await seedUser('eupd')
    const cookie = await signIn(user)
    const post = await createPost(cookie, user.id, { audience: 'all', status: 'draft' })

    const res = await postMultipart(
      `/posts/${post.uid}/edit`,
      postFields({ content: `updated-${suffix}`, status: 'published', audience: 'approved' }),
      cookie
    )
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe(`/profile/${user.uid}`)

    const [row] = await postsFor(user.id)
    expect(row.content).toBe(`updated-${suffix}`)
    expect(row.status).toBe('published')

    const target = await db.selectFrom('postTargets').select(['type']).where('postId', '=', post.id).executeTakeFirstOrThrow()
    expect(target.type).toBe('approved')

    const profile = await (await get(`/profile/${user.uid}`, cookie)).text()
    expect(profile).toContain(`updated-${suffix}`)
    expect(profile).toContain('(edited)')
  })

  test('clearing the link removes it; the stored image survives an edit without a new file', async () => {
    const user = await seedUser('ekeep')
    const cookie = await signIn(user)
    const image = new File([new Uint8Array([1, 2, 3])], 'pic.jpg', { type: 'image/jpeg' })
    const post = await createPost(cookie, user.id, { linkUrl: 'https://example.com/x', linkText: 'X', image })
    expect(post.imageUrl).toBe(UPLOADED_URL)

    uploadSpy.mockClear()
    const res = await postMultipart(`/posts/${post.uid}/edit`, postFields({ linkUrl: '', linkText: '' }), cookie)
    expect(res.status).toBe(303)

    const [row] = await postsFor(user.id)
    expect(row.linkUrl).toBeNull()
    expect(row.linkText).toBeNull()
    expect(row.imageUrl).toBe(UPLOADED_URL)
    expect(uploadSpy.mock.calls.length).toBe(0)
  })

  test('an archived post stays on your own profile with its status and stays editable', async () => {
    const user = await seedUser('earc')
    const cookie = await signIn(user)
    const post = await createPost(cookie, user.id, { content: `archy-${suffix}` })

    const res = await postMultipart(
      `/posts/${post.uid}/edit`,
      postFields({ content: `archy-${suffix}`, status: 'archived' }),
      cookie
    )
    expect(res.status).toBe(303)

    const [row] = await postsFor(user.id)
    expect(row.status).toBe('archived')
    const profile = await (await get(`/profile/${user.uid}`, cookie)).text()
    expect(profile).toContain(`archy-${suffix}`)
    expect(profile).toContain('· archived')

    // still editable, with Archived selected; Draft is only offered while a post is a draft
    const editPage = await (await get(`/posts/${post.uid}/edit`, cookie)).text()
    expect(editPage).toContain('<option value="archived" selected="">')
    expect(editPage).not.toContain('value="draft"')
  })

  test('the edit form no longer accepts deleted as a status', async () => {
    const user = await seedUser('enod')
    const cookie = await signIn(user)
    const post = await createPost(cookie, user.id)

    const res = await postMultipart(`/posts/${post.uid}/edit`, postFields({ status: 'deleted' }), cookie)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Please pick a valid status.')
    expect((await postsFor(user.id))[0].status).toBe('published')
  })

  test('a validation error re-renders the edit form addressed to the edit route', async () => {
    const user = await seedUser('eerr')
    const cookie = await signIn(user)
    const post = await createPost(cookie, user.id)

    const res = await postMultipart(`/posts/${post.uid}/edit`, postFields({ content: '   ' }), cookie)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('Post text is required.')
    expect(body).toContain(`hx-post="/posts/${post.uid}/edit"`)
  })
})

describe('POST /posts/:uid/delete', () => {
  test('deletes the post, hides it, and locks it from further edits', async () => {
    const user = await seedUser('edel')
    const cookie = await signIn(user)
    const post = await createPost(cookie, user.id, { content: `gone-${suffix}` })

    const res = await postMultipart(`/posts/${post.uid}/delete`, {}, cookie)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe(`/profile/${user.uid}`)

    const [row] = await postsFor(user.id)
    expect(row.status).toBe('deleted')

    const profile = await (await get(`/profile/${user.uid}`, cookie)).text()
    expect(profile).not.toContain(`gone-${suffix}`)
    expect((await get(`/posts/${post.uid}/edit`, cookie)).status).toBe(404)
  })

  test("someone else's post cannot be deleted", async () => {
    const owner = await seedUser('edown')
    const intruder = await seedUser('edint')
    const ownerCookie = await signIn(owner)
    const post = await createPost(ownerCookie, owner.id)

    const intruderCookie = await signIn(intruder)
    const res = await postMultipart(`/posts/${post.uid}/delete`, {}, intruderCookie)
    expect(res.status).toBe(404)
    expect((await postsFor(owner.id))[0].status).toBe('published')
  })
})

describe('Edit links on the profile page', () => {
  test("your own posts carry an edit link; someone else's do not", async () => {
    const user = await seedUser('elme')
    const viewer = await seedUser('elyou')
    const cookie = await signIn(user)
    const post = await createPost(cookie, user.id)

    const own = await (await get(`/profile/${user.uid}`, cookie)).text()
    expect(own).toContain(`href="/posts/${post.uid}/edit"`)

    const viewerCookie = await signIn(viewer)
    const theirs = await (await get(`/profile/${user.uid}`, viewerCookie)).text()
    expect(theirs).not.toContain(`href="/posts/${post.uid}/edit"`)
  })
})

describe('New Post link on the profile page', () => {
  test('your own profile shows the link; someone else’s does not', async () => {
    const user = await seedUser('nlme')
    const other = await seedUser('nlyou')
    const cookie = await signIn(user)

    const own = await (await get(`/profile/${user.uid}`, cookie)).text()
    expect(own).toContain('href="/posts/new"')

    const theirs = await (await get(`/profile/${other.uid}`, cookie)).text()
    expect(theirs).not.toContain('href="/posts/new"')
  })
})
