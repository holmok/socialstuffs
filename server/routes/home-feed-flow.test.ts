import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import type { PostStatus } from '@data/post-data'
import type { PostTargetType } from '@data/post-target-data'
import type { RelationType } from '@data/relation-data'
import normalizeEmail from 'normalize-email'
import pino from 'pino'
import LoadConfig from '@/config'
import { __resetRateLimits } from '@/middleware'
import { createApp } from '@/server'

const config = LoadConfig()
const logger = pino({ level: 'silent' })
const { app, db } = createApp(config, logger)

const suffix = Math.random().toString(36).slice(2, 10)

const PASSWORD = 'Feed99!okay'

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

let postCounter = 0
async function seedPost(author: SeededUser, name: string, audience: PostTargetType, status: PostStatus = 'published') {
  postCounter += 1
  const post = await db
    .insertInto('posts')
    .values({
      uid: `feed-${postCounter}-${suffix}`,
      userId: author.id,
      userUid: author.uid,
      content: `${name}-${suffix}`,
      status
    })
    .returning(['id', 'uid'])
    .executeTakeFirstOrThrow()
  await db
    .insertInto('postTargets')
    .values({ postId: post.id, postUid: post.uid, userId: author.id, userUid: author.uid, type: audience })
    .execute()
  return post
}

function favorite(from: SeededUser, to: SeededUser) {
  return db.insertInto('favorites').values({ userId: from.id, userUid: from.uid, friendId: to.id, friendUid: to.uid }).execute()
}

function relate(from: SeededUser, to: SeededUser, type: RelationType) {
  return db
    .insertInto('relations')
    .values({ userId: from.id, userUid: from.uid, friendId: to.id, friendUid: to.uid, type })
    .execute()
}

function get(path: string, cookie?: string) {
  return app.request(`http://localhost${path}`, { headers: cookie ? { cookie } : {} })
}

let ipCounter = 0
async function signIn(user: SeededUser): Promise<string> {
  ipCounter += 1
  const res = await app.request('http://localhost/sign-in', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: 'http://localhost',
      'X-Forwarded-For': `10.6.0.${ipCounter}`
    },
    body: new URLSearchParams({ email: user.email, password: PASSWORD }).toString()
  })
  const cookie = res.headers.getSetCookie().find((s) => s.startsWith(`${config.auth.userCookieName}=`))
  if (res.status !== 303 || !cookie) throw new Error('sign-in did not succeed for seeded user')
  return cookie.split(';')[0]
}

beforeEach(() => {
  __resetRateLimits()
})

afterAll(async () => {
  const users = await db.selectFrom('users').where('normalizedEmail', 'like', `%${suffix}%`).select(['id']).execute()
  const ids = users.map((u) => u.id)
  if (ids.length > 0) {
    await db
      .deleteFrom('relations')
      .where((eb) => eb.or([eb('userId', 'in', ids), eb('friendId', 'in', ids)]))
      .execute()
    await db
      .deleteFrom('favorites')
      .where((eb) => eb.or([eb('userId', 'in', ids), eb('friendId', 'in', ids)]))
      .execute()
    await db.deleteFrom('postTargets').where('userId', 'in', ids).execute()
    await db.deleteFrom('posts').where('userId', 'in', ids).execute()
    await db.deleteFrom('users').where('id', 'in', ids).execute()
  }
  await db.destroy()
})

describe('GET /', () => {
  test('anonymous visitors get the marketing page, not a feed', async () => {
    const res = await get('/')
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('Create your account')
    expect(body).not.toContain('Latest Posts from Your Circle')
    // the New Post nav item is authenticated-only
    expect(body).not.toContain('href="/posts/new"')
  })

  test('a signed-in user with an empty circle sees the empty-feed message with a New Post link', async () => {
    const viewer = await seedUser('fempty')
    const cookie = await signIn(viewer)
    const body = await (await get('/', cookie)).text()
    expect(body).toContain('Latest Posts from Your Circle')
    expect(body).toContain('Nothing here yet.')
    // the empty state links to composing a first post, and the nav carries New Post for signed-in users
    expect(body).toContain('write your first post')
    expect(body).toContain('href="/posts/new"')
  })

  test('a banned user loses the feed immediately: the same cookie now gets the anonymous page', async () => {
    const viewer = await seedUser('frevk')
    const cookie = await signIn(viewer)
    const before = await (await get('/', cookie)).text()
    expect(before).toContain('Latest Posts from Your Circle')

    await db.updateTable('users').set({ status: 'inactive' }).where('id', '=', viewer.id).execute()

    const res = await get('/', cookie)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('Create your account')
    expect(body).not.toContain('Latest Posts from Your Circle')
    // and the response revokes the stale auth cookie
    const cleared = res.headers.getSetCookie().find((s) => s.startsWith(`${config.auth.userCookieName}=`))
    expect(cleared).toContain('Max-Age=0')
  })

  test('the feed applies the circle and audience rules', async () => {
    const viewer = await seedUser('fv')
    const favAuthor = await seedUser('ffa') // in circle: viewer favorited them
    const appAuthor = await seedUser('faa') // in circle: viewer approved them
    const stranger = await seedUser('fst') // not in circle
    await favorite(viewer, favAuthor)
    await relate(viewer, appAuthor, 'approve')

    // what the authors think of the viewer
    await favorite(favAuthor, viewer) // favAuthor favorited the viewer (but has no approve relation)
    await relate(favAuthor, viewer, 'disapprove') // ...and disapproved them
    await relate(appAuthor, viewer, 'approve') // appAuthor approved the viewer (but did not favorite them)

    const visible = [
      await seedPost(favAuthor, 'fav-all', 'all'),
      await seedPost(favAuthor, 'fav-favorites', 'favorites'), // favAuthor favorited the viewer
      await seedPost(appAuthor, 'app-approved', 'approved'), // appAuthor approved the viewer
      await seedPost(appAuthor, 'app-nondis', 'non_disapproved'), // appAuthor did not disapprove the viewer
      await seedPost(viewer, 'own-favorites', 'favorites') // the viewer's own posts show regardless of audience
    ]
    const hidden = [
      await seedPost(appAuthor, 'app-favorites', 'favorites'), // appAuthor never favorited the viewer
      await seedPost(favAuthor, 'fav-approved', 'approved'), // favAuthor never approved the viewer
      await seedPost(favAuthor, 'fav-nondis', 'non_disapproved'), // favAuthor disapproved the viewer
      await seedPost(stranger, 'str-all', 'all'), // not in the viewer's circle
      await seedPost(favAuthor, 'fav-draft', 'all', 'draft'), // not published
      await seedPost(viewer, 'own-draft', 'all', 'draft') // own drafts stay off the feed too
    ]
    expect(visible.length + hidden.length).toBe(11)

    const cookie = await signIn(viewer)
    const body = await (await get('/', cookie)).text()
    for (const name of ['fav-all', 'fav-favorites', 'app-approved', 'app-nondis', 'own-favorites']) {
      expect(body).toContain(`${name}-${suffix}`)
    }
    for (const name of ['app-favorites', 'fav-approved', 'fav-nondis', 'str-all', 'fav-draft', 'own-draft']) {
      expect(body).not.toContain(`${name}-${suffix}`)
    }
    // posts credit their author and link to the profile; username is the name fallback when no fullname is set
    expect(body).toContain(`href="/profile/${favAuthor.uid}"`)
    expect(body).toContain(`Posted by <a href="/profile/${favAuthor.uid}">${favAuthor.username}</a>`)
  })

  test('the feed pages five at a time via ?p=', async () => {
    const viewer = await seedUser('fpv')
    const author = await seedUser('fpa')
    await favorite(viewer, author)
    // sequential inserts so ascending ids break the created-timestamp ties deterministically
    for (let i = 1; i <= 7; i++) {
      await seedPost(author, `fpage-${i}`, 'all')
    }
    const cookie = await signIn(viewer)

    // page 1: the five newest (7..3) and only an Older link
    const page1 = await (await get('/', cookie)).text()
    for (const i of [7, 6, 5, 4, 3]) expect(page1).toContain(`fpage-${i}-${suffix}`)
    for (const i of [2, 1]) expect(page1).not.toContain(`fpage-${i}-${suffix}`)
    expect(page1).toContain('href="/?p=2"')
    expect(page1).not.toContain('?p=0')

    // page 2: the remaining two and only a Newer link
    const page2 = await (await get('/?p=2', cookie)).text()
    for (const i of [2, 1]) expect(page2).toContain(`fpage-${i}-${suffix}`)
    for (const i of [7, 3]) expect(page2).not.toContain(`fpage-${i}-${suffix}`)
    expect(page2).toContain('href="/?p=1"')
    expect(page2).not.toContain('?p=3')
  })
})

describe('discover CTA on the home feed', () => {
  test('a user with no favorites or approvals sees the CTA pointing at /discover', async () => {
    const viewer = await seedUser('ctanew')
    const cookie = await signIn(viewer)

    const body = await (await get('/', cookie)).text()
    expect(body).toContain('class="feed-cta"')
    expect(body).toContain('href="/discover"')
  })

  test('having a favorite hides the CTA', async () => {
    const viewer = await seedUser('ctafav')
    const other = await seedUser('ctafo')
    await favorite(viewer, other)
    const cookie = await signIn(viewer)

    const body = await (await get('/', cookie)).text()
    expect(body).not.toContain('class="feed-cta"')
  })

  test('having an approval hides the CTA', async () => {
    const viewer = await seedUser('ctaapp')
    const other = await seedUser('ctaao')
    await relate(viewer, other, 'approve')
    const cookie = await signIn(viewer)

    const body = await (await get('/', cookie)).text()
    expect(body).not.toContain('class="feed-cta"')
  })

  test('a disapproval alone does not hide the CTA — it adds nothing to the feed', async () => {
    const viewer = await seedUser('ctadis')
    const other = await seedUser('ctado')
    await relate(viewer, other, 'disapprove')
    const cookie = await signIn(viewer)

    const body = await (await get('/', cookie)).text()
    expect(body).toContain('class="feed-cta"')
  })
})
