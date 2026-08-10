import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import type { PostStatus } from '@data/post-data'
import type { PostTargetType } from '@data/post-target-data'
import normalizeEmail from 'normalize-email'
import pino from 'pino'
import LoadConfig from '@/config'
import { __resetRateLimits } from '@/middleware'
import { createApp } from '@/server'

const config = LoadConfig()
const logger = pino({ level: 'silent' })
const { app, db } = createApp(config, logger)

const suffix = Math.random().toString(36).slice(2, 10)

const PASSWORD = 'Discover99!ok'

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
// audience null seeds a legacy post with no postTargets row (counts as 'all')
async function seedPost(author: SeededUser, name: string, audience: PostTargetType | null, status: PostStatus = 'published') {
  postCounter += 1
  const post = await db
    .insertInto('posts')
    .values({
      uid: `disc-${postCounter}-${suffix}`,
      userId: author.id,
      userUid: author.uid,
      content: `${name}-${suffix}`,
      status
    })
    .returning(['id', 'uid'])
    .executeTakeFirstOrThrow()
  if (audience != null) {
    await db
      .insertInto('postTargets')
      .values({ postId: post.id, postUid: post.uid, userId: author.id, userUid: author.uid, type: audience })
      .execute()
  }
  return post
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
      'X-Forwarded-For': `10.7.0.${ipCounter}`
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
    await db.deleteFrom('postTargets').where('userId', 'in', ids).execute()
    await db.deleteFrom('posts').where('userId', 'in', ids).execute()
    await db.deleteFrom('users').where('id', 'in', ids).execute()
  }
  await db.destroy()
})

describe('GET /discover', () => {
  test('unauthenticated visitors are redirected to sign-in', async () => {
    const res = await get('/discover')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('/sign-in')
  })

  test("shows strangers' everyone-audience posts; hides scoped audiences and drafts", async () => {
    const viewer = await seedUser('dv')
    const stranger = await seedUser('ds')
    await seedPost(stranger, 'dpublic', 'all')
    await seedPost(stranger, 'dscoped', 'approved')
    await seedPost(stranger, 'ddraft', 'all', 'draft')
    const cookie = await signIn(viewer)

    const body = await (await get('/discover', cookie)).text()
    // the viewer has no circle at all — discover still shows the stranger's public post
    expect(body).toContain(`dpublic-${suffix}`)
    expect(body).not.toContain(`dscoped-${suffix}`)
    expect(body).not.toContain(`ddraft-${suffix}`)
    // the card links to the author's profile so the viewer can favorite/approve them
    expect(body).toContain(`href="/profile/${stranger.uid}"`)
  })

  test("a legacy post with no audience row counts as everyone's", async () => {
    const viewer = await seedUser('dlv')
    const author = await seedUser('dla')
    await seedPost(author, 'dlegacy', null)
    const cookie = await signIn(viewer)

    const body = await (await get('/discover', cookie)).text()
    expect(body).toContain(`dlegacy-${suffix}`)
  })

  test('posts by non-active authors are hidden', async () => {
    const viewer = await seedUser('div')
    const author = await seedUser('dia')
    await seedPost(author, 'dinactive', 'all')
    await db.updateTable('users').set({ status: 'inactive' }).where('id', '=', author.id).execute()
    const cookie = await signIn(viewer)

    const body = await (await get('/discover', cookie)).text()
    expect(body).not.toContain(`dinactive-${suffix}`)
  })

  test('pages five at a time, newest first', async () => {
    const viewer = await seedUser('dpv')
    const author = await seedUser('dpa')
    for (let i = 1; i <= 6; i++) {
      await seedPost(author, `dpage${i}`, 'all')
    }
    const cookie = await signIn(viewer)

    const pageOne = await (await get('/discover', cookie)).text()
    // six posts share a created instant, so id (insert order) breaks ties: newest five on page one
    expect(pageOne).toContain(`dpage6-${suffix}`)
    expect(pageOne).toContain(`dpage2-${suffix}`)
    expect(pageOne).not.toContain(`dpage1-${suffix}`)
    expect(pageOne).toContain('href="/discover?p=2"')

    const pageTwo = await (await get('/discover?p=2', cookie)).text()
    expect(pageTwo).toContain(`dpage1-${suffix}`)
    expect(pageTwo).toContain('href="/discover?p=1"')
  })

  test('the authenticated nav links to discover', async () => {
    const viewer = await seedUser('dnv')
    const cookie = await signIn(viewer)
    const body = await (await get('/', cookie)).text()
    expect(body).toContain('href="/discover"')
  })
})
