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

const PASSWORD = 'Profile99!ok'

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
function post(path: string, cookie?: string, headers: Record<string, string> = {}) {
  ipCounter += 1
  return app.request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // csrf() requires a same-origin signal; request URL origin is http://localhost
      Origin: 'http://localhost',
      // unique per request so the per-IP rate limiter never trips across tests
      'X-Forwarded-For': `10.4.0.${ipCounter}`,
      ...(cookie ? { cookie } : {}),
      ...headers
    },
    body: ''
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
      'X-Forwarded-For': `10.4.1.${ipCounter}`
    },
    body: new URLSearchParams({ email: user.email, password: PASSWORD }).toString()
  })
  const cookie = res.headers.getSetCookie().find((s) => s.startsWith(`${config.auth.userCookieName}=`))
  if (res.status !== 303 || !cookie) throw new Error('sign-in did not succeed for seeded user')
  return cookie.split(';')[0]
}

let postCounter = 0
async function seedPost(author: SeededUser, name: string, audience: PostTargetType, status: PostStatus = 'published') {
  postCounter += 1
  const post = await db
    .insertInto('posts')
    .values({
      uid: `prof-${postCounter}-${suffix}`,
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

function relationRow(userId: number, friendId: number) {
  return db
    .selectFrom('relations')
    .select(['type'])
    .where('userId', '=', userId)
    .where('friendId', '=', friendId)
    .executeTakeFirst()
}

function favoriteRow(userId: number, friendId: number) {
  return db
    .selectFrom('favorites')
    .select(['id'])
    .where('userId', '=', userId)
    .where('friendId', '=', friendId)
    .executeTakeFirst()
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

describe('auth gating on /profile', () => {
  test('unauthenticated GET redirects to /sign-in', async () => {
    const res = await get('/profile/some-uid')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/sign-in?next=%2Fprofile%2Fsome-uid')
  })
})

describe('GET /profile/:uid', () => {
  test("another user's profile renders their info, action buttons, and tallies", async () => {
    const viewer = await seedUser('pv')
    const target = await seedUser('pt')
    await db
      .updateTable('users')
      .set({ info: { fullname: 'Terry Target', title: 'Gardener', location: 'Boise', bio: 'Plants are good.' } })
      .where('id', '=', target.id)
      .execute()
    const cookie = await signIn(viewer)

    const res = await get(`/profile/${target.uid}`, cookie)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('Terry Target')
    expect(body).toContain(`@${target.username}`)
    expect(body).toContain('Gardener · Boise')
    expect(body).toContain('Plants are good.')
    expect(body).toContain('id="profile-actions"')
    expect(body).toContain(`hx-post="/profile/${target.uid}/approve"`)
    expect(body).toContain(`hx-post="/profile/${target.uid}/disapprove"`)
    expect(body).toContain(`hx-post="/profile/${target.uid}/favorite"`)
    expect(body).toContain('Approvals')
    expect(body).toContain('Disapprovals')
    // no uploaded photo: avatar falls back to the shared placeholder
    expect(body).toContain('profile.jpg')
  })

  test('your own profile shows the edit link instead of action buttons', async () => {
    const user = await seedUser('pown')
    const cookie = await signIn(user)

    const body = await (await get(`/profile/${user.uid}`, cookie)).text()
    expect(body).toContain('href="/user/edit-profile"')
    expect(body).not.toContain(`hx-post="/profile/${user.uid}/approve"`)
    expect(body).not.toContain(`hx-post="/profile/${user.uid}/favorite"`)
  })

  test('an unknown uid is a 404', async () => {
    const viewer = await seedUser('p404')
    const cookie = await signIn(viewer)
    const res = await get(`/profile/no-such-${suffix}`, cookie)
    expect(res.status).toBe(404)
  })

  test('received relations show up in the tallies and the viewer state marks the active button', async () => {
    const viewer = await seedUser('ptal')
    const fan = await seedUser('pfan')
    const target = await seedUser('ptgt')
    await db
      .insertInto('relations')
      .values([
        { userId: fan.id, userUid: fan.uid, friendId: target.id, friendUid: target.uid, type: 'approve' },
        { userId: viewer.id, userUid: viewer.uid, friendId: target.id, friendUid: target.uid, type: 'approve' }
      ])
      .execute()
    const cookie = await signIn(viewer)

    const body = await (await get(`/profile/${target.uid}`, cookie)).text()
    expect(body).toContain('<span class="profile-tally-count">2</span>')
    expect(body).toContain('aria-pressed="true">Approved</button>')
  })

  test('only published posts are listed', async () => {
    const viewer = await seedUser('ppv')
    const target = await seedUser('ppt')
    await db
      .insertInto('posts')
      .values([
        { uid: `post-a-${suffix}`, userId: target.id, userUid: target.uid, content: `published-${suffix}`, status: 'published' },
        { uid: `post-b-${suffix}`, userId: target.id, userUid: target.uid, content: `draft-${suffix}`, status: 'draft' }
      ])
      .execute()
    const cookie = await signIn(viewer)

    const body = await (await get(`/profile/${target.uid}`, cookie)).text()
    expect(body).toContain(`published-${suffix}`)
    expect(body).not.toContain(`draft-${suffix}`)
  })

  test('your own profile lists every non-deleted post with its status after the date', async () => {
    const user = await seedUser('psts')
    await seedPost(user, 'own-pub', 'all', 'published')
    await seedPost(user, 'own-draft', 'all', 'draft')
    await seedPost(user, 'own-arch', 'all', 'archived')
    await seedPost(user, 'own-del', 'all', 'deleted')
    const cookie = await signIn(user)

    const body = await (await get(`/profile/${user.uid}`, cookie)).text()
    for (const name of ['own-pub', 'own-draft', 'own-arch']) expect(body).toContain(`${name}-${suffix}`)
    expect(body).not.toContain(`own-del-${suffix}`)
    expect(body).toContain('· published')
    expect(body).toContain('· draft')
    expect(body).toContain('· archived')
  })

  test("another person's profile only shows published posts whose audience includes you", async () => {
    const viewer = await seedUser('pauv')
    const owner = await seedUser('pauo')
    // the owner favorited the viewer but also disapproved them (and never approved them)
    await db
      .insertInto('favorites')
      .values({ userId: owner.id, userUid: owner.uid, friendId: viewer.id, friendUid: viewer.uid })
      .execute()
    await db
      .insertInto('relations')
      .values({ userId: owner.id, userUid: owner.uid, friendId: viewer.id, friendUid: viewer.uid, type: 'disapprove' })
      .execute()

    await seedPost(owner, 'aud-all', 'all')
    await seedPost(owner, 'aud-fav', 'favorites') // visible: the owner favorited the viewer
    await seedPost(owner, 'aud-app', 'approved') // hidden: the owner never approved the viewer
    await seedPost(owner, 'aud-non', 'non_disapproved') // hidden: the owner disapproved the viewer
    await seedPost(owner, 'aud-draft', 'all', 'draft') // hidden: not published
    const cookie = await signIn(viewer)

    const body = await (await get(`/profile/${owner.uid}`, cookie)).text()
    for (const name of ['aud-all', 'aud-fav']) expect(body).toContain(`${name}-${suffix}`)
    for (const name of ['aud-app', 'aud-non', 'aud-draft']) expect(body).not.toContain(`${name}-${suffix}`)
    // status only shows on your own profile
    expect(body).not.toContain('· published')
  })

  test('posts are paged five at a time via ?p=', async () => {
    const viewer = await seedUser('pgv')
    const target = await seedUser('pgt')
    // sequential inserts so ascending ids break the created-timestamp ties deterministically
    for (let i = 1; i <= 7; i++) {
      await db
        .insertInto('posts')
        .values({
          uid: `pg-${i}-${suffix}`,
          userId: target.id,
          userUid: target.uid,
          content: `pgpost-${i}-${suffix}`,
          status: 'published'
        })
        .execute()
    }
    const cookie = await signIn(viewer)

    // page 1: the five newest (7..3) and only an Older link
    const page1 = await (await get(`/profile/${target.uid}`, cookie)).text()
    for (const i of [7, 6, 5, 4, 3]) expect(page1).toContain(`pgpost-${i}-${suffix}`)
    for (const i of [2, 1]) expect(page1).not.toContain(`pgpost-${i}-${suffix}`)
    expect(page1).toContain(`href="/profile/${target.uid}?p=2"`)
    expect(page1).not.toContain('?p=0')

    // page 2: the remaining two and only a Newer link
    const page2 = await (await get(`/profile/${target.uid}?p=2`, cookie)).text()
    for (const i of [2, 1]) expect(page2).toContain(`pgpost-${i}-${suffix}`)
    for (const i of [7, 3]) expect(page2).not.toContain(`pgpost-${i}-${suffix}`)
    expect(page2).toContain(`href="/profile/${target.uid}?p=1"`)
    expect(page2).not.toContain('?p=3')
  })
})

describe('POST /profile/:uid approve/disapprove', () => {
  test('sets, switches, and clears the relation as a mutually exclusive toggle', async () => {
    const viewer = await seedUser('rtog')
    const target = await seedUser('rtgt')
    const cookie = await signIn(viewer)

    // set
    const first = await post(`/profile/${target.uid}/approve`, cookie)
    expect(first.status).toBe(303)
    expect(first.headers.get('location')).toBe(`/profile/${target.uid}`)
    expect((await relationRow(viewer.id, target.id))?.type).toBe('approve')

    // switch
    await post(`/profile/${target.uid}/disapprove`, cookie)
    expect((await relationRow(viewer.id, target.id))?.type).toBe('disapprove')

    // clear
    await post(`/profile/${target.uid}/disapprove`, cookie)
    expect(await relationRow(viewer.id, target.id)).toBeUndefined()
  })

  test('an HTMX request gets the refreshed actions fragment instead of a redirect', async () => {
    const viewer = await seedUser('rhx')
    const target = await seedUser('rhxt')
    const cookie = await signIn(viewer)

    const res = await post(`/profile/${target.uid}/approve`, cookie, { 'HX-Request': 'true' })
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('id="profile-actions"')
    expect(body).toContain('aria-pressed="true">Approved</button>')
    expect(body).toContain('<span class="profile-tally-count">1</span>')
  })

  test('acting on your own profile is a 400 and writes nothing', async () => {
    const user = await seedUser('rself')
    const cookie = await signIn(user)
    const res = await post(`/profile/${user.uid}/approve`, cookie)
    expect(res.status).toBe(400)
    expect(await relationRow(user.id, user.id)).toBeUndefined()
  })

  test('an unknown target is a 404', async () => {
    const viewer = await seedUser('r404')
    const cookie = await signIn(viewer)
    const res = await post(`/profile/no-such-${suffix}/approve`, cookie)
    expect(res.status).toBe(404)
  })
})

describe('POST /profile/:uid/favorite', () => {
  test('toggles the favorite on and off', async () => {
    const viewer = await seedUser('ftog')
    const target = await seedUser('ftgt')
    const cookie = await signIn(viewer)

    const first = await post(`/profile/${target.uid}/favorite`, cookie)
    expect(first.status).toBe(303)
    expect(await favoriteRow(viewer.id, target.id)).toBeDefined()

    await post(`/profile/${target.uid}/favorite`, cookie)
    expect(await favoriteRow(viewer.id, target.id)).toBeUndefined()
  })

  test("favorited users appear on the favoriter's profile as linked avatars", async () => {
    const viewer = await seedUser('fstr')
    const target = await seedUser('fsee')
    await db
      .updateTable('users')
      .set({ info: { fullname: 'Fay Seen' } })
      .where('id', '=', target.id)
      .execute()
    const cookie = await signIn(viewer)
    await post(`/profile/${target.uid}/favorite`, cookie)

    const body = await (await get(`/profile/${viewer.uid}`, cookie)).text()
    expect(body).toContain(`href="/profile/${target.uid}"`)
    expect(body).toContain('title="Fay Seen"')
    // below the strip cap there is no overflow indicator
    expect(body).not.toContain('…and more')
  })

  test('the favorites strip caps at 20 avatars and shows an overflow indicator', async () => {
    const owner = await seedUser('fcap')
    // the favorited users never sign in, so skip the bcrypt hash and seed them in bulk
    const friends = await db
      .insertInto('users')
      .values(
        Array.from({ length: 21 }, (_, i) => {
          const username = `ufc${i}${suffix}`.slice(0, 15)
          const email = `fc${i}-${suffix}@example.com`
          return {
            uid: `test-fc${i}-${suffix}`,
            username,
            normalizedUsername: username.toLowerCase(),
            email,
            normalizedEmail: normalizeEmail(email),
            passwordHash: 'not-a-real-hash'
          }
        })
      )
      .returning(['id', 'uid'])
      .execute()
    await db
      .updateTable('users')
      .set({ status: 'active' })
      .where(
        'id',
        'in',
        friends.map((f) => f.id)
      )
      .execute()
    await db
      .insertInto('favorites')
      .values(friends.map((f) => ({ userId: owner.id, userUid: owner.uid, friendId: f.id, friendUid: f.uid })))
      .execute()
    const cookie = await signIn(owner)

    const body = await (await get(`/profile/${owner.uid}`, cookie)).text()
    // count rendered avatars via the class attribute (the bare name also appears in the inline <style> block)
    expect(body.split('class="profile-favorite-avatar"').length - 1).toBe(20)
    expect(body).toContain('…and more')
  })
})
