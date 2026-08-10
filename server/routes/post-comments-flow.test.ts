import { afterAll, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import ImagesAPI from '@api/image-api'
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

const PASSWORD = 'NewComment9!ok'

// stub the Google-backed APIs so no credentials or network are ever touched
const languageSpy = spyOn(LanguageAPI.prototype, 'getContentFlags').mockResolvedValue([])
const uploadSpy = spyOn(ImagesAPI.prototype, 'uploadImage').mockResolvedValue('https://img.example.com/u/post-test.jpg')

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
function postMultipart(path: string, fields: Record<string, string | File>, cookie?: string) {
  ipCounter += 1
  const body = new FormData()
  for (const [key, value] of Object.entries(fields)) body.append(key, value)
  return app.request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      // csrf() requires a same-origin signal; request URL origin is http://localhost
      Origin: 'http://localhost',
      // unique per request so the per-IP rate limiter never trips across tests
      'X-Forwarded-For': `10.6.0.${ipCounter}`,
      ...(cookie ? { cookie } : {})
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
      'X-Forwarded-For': `10.6.1.${ipCounter}`
    },
    body: new URLSearchParams({ email: user.email, password: PASSWORD }).toString()
  })
  const cookie = res.headers.getSetCookie().find((s) => s.startsWith(`${config.auth.userCookieName}=`))
  if (res.status !== 303 || !cookie) throw new Error('sign-in did not succeed for seeded user')
  return cookie.split(';')[0]
}

// the post form always posts every field; override per test
function postFields(overrides: Record<string, string | File> = {}) {
  return { content: `hello-${suffix}`, linkUrl: '', linkText: '', status: 'published', audience: 'all', ...overrides }
}

// creates a post through the real route and returns its stored row
async function createPost(cookie: string, userId: number, overrides: Record<string, string | File> = {}) {
  const res = await postMultipart('/posts/new', postFields(overrides), cookie)
  if (res.status !== 303) throw new Error('post creation did not succeed')
  const rows = await db.selectFrom('posts').select(['id', 'uid']).where('userId', '=', userId).execute()
  return rows[rows.length - 1]
}

function postComment(postUid: string, content: string, cookie: string) {
  return postMultipart(`/posts/${postUid}/comments`, { content }, cookie)
}

function commentsFor(postId: number) {
  return db.selectFrom('comments').select(['id', 'uid', 'content', 'userUid']).where('postId', '=', postId).execute()
}

// seeds rows directly to reach the cap without 29 round trips through the route
function seedComments(postId: number, user: SeededUser, count: number) {
  const rows = Array.from({ length: count }, (_, index) => ({
    uid: `test-c${index}-${suffix}`,
    postId,
    userId: user.id,
    userUid: user.uid,
    content: `seeded comment ${index}`
  }))
  return db.insertInto('comments').values(rows).execute()
}

beforeEach(() => {
  __resetRateLimits()
  languageSpy.mockClear()
})

afterAll(async () => {
  const users = await db.selectFrom('users').where('normalizedEmail', 'like', `%${suffix}%`).select(['id']).execute()
  const ids = users.map((u) => u.id)
  if (ids.length > 0) {
    await db.deleteFrom('comments').where('userId', 'in', ids).execute()
    await db.deleteFrom('relations').where('userId', 'in', ids).execute()
    await db.deleteFrom('postTargets').where('userId', 'in', ids).execute()
    await db.deleteFrom('posts').where('userId', 'in', ids).execute()
    await db.deleteFrom('users').where('id', 'in', ids).execute()
  }
  languageSpy.mockRestore()
  uploadSpy.mockRestore()
  await db.destroy()
})

describe('GET /posts/:uid — visibility', () => {
  test('unauthenticated view redirects to /sign-in', async () => {
    const res = await get('/posts/some-uid')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/sign-in')
  })

  test('the author sees their published post with the empty comments section and form', async () => {
    const user = await seedUser('vown')
    const cookie = await signIn(user)
    const post = await createPost(cookie, user.id, { content: `viewable-${suffix}` })

    const res = await get(`/posts/${post.uid}`, cookie)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain(`viewable-${suffix}`)
    expect(body).toContain('Comments')
    expect(body).toContain('No comments yet.')
    expect(body).toContain(`hx-post="/posts/${post.uid}/comments"`)
    // the live character counter starts at zero for an empty form
    expect(body).toContain('0/200 characters')
  })

  test('an unknown uid is a 404', async () => {
    const user = await seedUser('vmiss')
    const cookie = await signIn(user)
    const res = await get(`/posts/no-such-${suffix}`, cookie)
    expect(res.status).toBe(404)
  })

  test('a draft post is a 404 even for its author', async () => {
    const user = await seedUser('vdft')
    const cookie = await signIn(user)
    const post = await createPost(cookie, user.id, { status: 'draft' })
    const res = await get(`/posts/${post.uid}`, cookie)
    expect(res.status).toBe(404)
  })

  test('an approved-only post is hidden from a stranger and visible once approved', async () => {
    const owner = await seedUser('vappo')
    const viewer = await seedUser('vappv')
    const ownerCookie = await signIn(owner)
    const post = await createPost(ownerCookie, owner.id, { audience: 'approved' })

    const viewerCookie = await signIn(viewer)
    expect((await get(`/posts/${post.uid}`, viewerCookie)).status).toBe(404)

    await db
      .insertInto('relations')
      .values({ userId: owner.id, userUid: owner.uid, friendId: viewer.id, friendUid: viewer.uid, type: 'approve' })
      .execute()
    expect((await get(`/posts/${post.uid}`, viewerCookie)).status).toBe(200)
  })
})

describe('POST /posts/:uid/comments', () => {
  test('adds comments, redirects back to the post, and renders them oldest first', async () => {
    const user = await seedUser('cadd')
    const cookie = await signIn(user)
    const post = await createPost(cookie, user.id)

    const first = await postComment(post.uid, `first comment ${suffix}`, cookie)
    expect(first.status).toBe(303)
    expect(first.headers.get('location')).toBe(`/posts/${post.uid}`)
    const second = await postComment(post.uid, `second comment ${suffix}`, cookie)
    expect(second.status).toBe(303)

    const rows = await commentsFor(post.id)
    expect(rows.length).toBe(2)
    expect(rows.every((row) => row.userUid === user.uid)).toBe(true)
    expect(rows.every((row) => row.uid)).toBe(true)

    const body = await (await get(`/posts/${post.uid}`, cookie)).text()
    const firstAt = body.indexOf(`first comment ${suffix}`)
    const secondAt = body.indexOf(`second comment ${suffix}`)
    expect(firstAt).toBeGreaterThan(-1)
    expect(secondAt).toBeGreaterThan(firstAt)
    // the commenter is named and linked on each comment
    expect(body).toContain(user.username)
  })

  test('empty content re-renders the form with the error before moderation', async () => {
    const user = await seedUser('cempty')
    const cookie = await signIn(user)
    const post = await createPost(cookie, user.id)

    const res = await postComment(post.uid, '   ', cookie)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Comment text is required.')
    expect(languageSpy.mock.calls.length).toBe(1) // the post creation call only
    expect((await commentsFor(post.id)).length).toBe(0)
  })

  test('content over 200 characters re-renders with the length error', async () => {
    const user = await seedUser('clong')
    const cookie = await signIn(user)
    const post = await createPost(cookie, user.id)

    const res = await postComment(post.uid, 'x'.repeat(201), cookie)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Comments must be at most 200 characters long.')
    expect((await commentsFor(post.id)).length).toBe(0)
  })

  test('flagged text re-renders with a field error and nothing is saved', async () => {
    const user = await seedUser('cflag')
    const cookie = await signIn(user)
    const post = await createPost(cookie, user.id)
    languageSpy.mockResolvedValueOnce(['Insult'])

    const res = await postComment(post.uid, 'rude comment', cookie)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('This text appears to contain inappropriate content.')
    expect((await commentsFor(post.id)).length).toBe(0)
  })

  test('a moderation outage fails closed with a form-level error', async () => {
    const user = await seedUser('cdown')
    const cookie = await signIn(user)
    const post = await createPost(cookie, user.id)
    languageSpy.mockRejectedValueOnce(new Error('language API down'))

    const res = await postComment(post.uid, 'fine text', cookie)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('check your text right now')
    expect((await commentsFor(post.id)).length).toBe(0)
  })

  test('users outside the audience cannot comment', async () => {
    const owner = await seedUser('cout')
    const stranger = await seedUser('cstr')
    const ownerCookie = await signIn(owner)
    const post = await createPost(ownerCookie, owner.id, { audience: 'approved' })

    const strangerCookie = await signIn(stranger)
    const res = await postComment(post.uid, 'let me in', strangerCookie)
    expect(res.status).toBe(404)
    expect((await commentsFor(post.id)).length).toBe(0)
  })

  test('the 30-comment limit blocks new comments and replaces the form', async () => {
    const user = await seedUser('ccap')
    const cookie = await signIn(user)
    const post = await createPost(cookie, user.id)
    await seedComments(post.id, user, 29)

    // the 30th comment still lands
    expect((await postComment(post.uid, `last one ${suffix}`, cookie)).status).toBe(303)

    // the 31st is rejected and nothing is saved
    const res = await postComment(post.uid, 'one too many', cookie)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('This post has reached its comment limit.')
    expect((await commentsFor(post.id)).length).toBe(30)

    // the post page shows the limit message instead of the form
    const body = await (await get(`/posts/${post.uid}`, cookie)).text()
    expect(body).toContain('This post has reached its comment limit.')
    expect(body).not.toContain(`hx-post="/posts/${post.uid}/comments"`)
    expect(body).toContain(`last one ${suffix}`)
  })
})

describe('comment counts', () => {
  test('the profile page links the comment count to the post page', async () => {
    const user = await seedUser('nprof')
    const cookie = await signIn(user)
    const post = await createPost(cookie, user.id)

    let profile = await (await get(`/profile/${user.uid}`, cookie)).text()
    expect(profile).toContain(`<a href="/posts/${post.uid}">0 comments</a>`)

    await postComment(post.uid, `count me ${suffix}`, cookie)
    profile = await (await get(`/profile/${user.uid}`, cookie)).text()
    expect(profile).toContain(`<a href="/posts/${post.uid}">1 comment</a>`)
  })

  test('a draft post shows no comment link on your own profile', async () => {
    const user = await seedUser('ndraft')
    const cookie = await signIn(user)
    const post = await createPost(cookie, user.id, { status: 'draft' })

    const profile = await (await get(`/profile/${user.uid}`, cookie)).text()
    expect(profile).not.toContain(`href="/posts/${post.uid}"`)
  })

  test('the home feed links the comment count to the post page', async () => {
    const user = await seedUser('nfeed')
    const cookie = await signIn(user)
    const post = await createPost(cookie, user.id)
    await postComment(post.uid, `feed count ${suffix}`, cookie)
    await postComment(post.uid, `feed count two ${suffix}`, cookie)

    const home = await (await get('/', cookie)).text()
    expect(home).toContain(`<a href="/posts/${post.uid}">2 comments</a>`)
  })
})
