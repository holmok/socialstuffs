import { afterAll, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import UserDataAPI, { UserDataError } from '@api/user-data-api'
import data from '@data/index'
import type { NewPostData } from '@data/post-data'
import type { UserMeta } from '@data/user-data'
import { Storage } from '@google-cloud/storage'
import * as DateFns from 'date-fns'
import { strFromU8, unzipSync } from 'fflate'
import normalizeEmail from 'normalize-email'
import pino from 'pino'
import LoadConfig from '@/config'

const config = LoadConfig()
const logger = pino({ level: 'silent' })
const db = data(config.poolConfig, config.dbSchema, logger)

const suffix = Math.random().toString(36).slice(2, 10)

// fake GCS bucket: records saves/deletes instead of talking to Google
let zipExists = false
let savedZips: { path: string; data: Buffer }[] = []
let bucketImages: { name: string; contents: Buffer }[] = []
let deleteFilesCalls: Record<string, unknown>[] = []
let getFilesError: Error | undefined

const fakeBucket = {
  file: (path: string) => ({
    exists: async () => [zipExists],
    save: async (buffer: Buffer) => {
      savedZips.push({ path, data: buffer })
    }
  }),
  getFiles: async (_opts: { prefix: string }) => {
    if (getFilesError) throw getFilesError
    return [bucketImages.map((f) => ({ name: f.name, download: async () => [f.contents] }))]
  },
  deleteFiles: async (opts: Record<string, unknown>) => {
    deleteFilesCalls.push(opts)
  }
}

const bucketSpy = spyOn(Storage.prototype, 'bucket').mockReturnValue(fakeBucket as never)

const api = new UserDataAPI(db, config, logger)

type SeededUser = { id: number; uid: string }
const seededUserIds: number[] = []
const seededUserUids: string[] = []

async function seedUser(name: string, info: UserMeta = {}): Promise<SeededUser> {
  const username = `u${name}${suffix}`.slice(0, 15)
  const email = `${name}-${suffix}@example.com`
  const row = await db
    .insertInto('users')
    .values({
      uid: `test-${name}-${suffix}`,
      username,
      normalizedUsername: username.toLowerCase(),
      email,
      normalizedEmail: normalizeEmail(email),
      passwordHash: 'not-a-real-hash'
    })
    .returning(['id', 'uid'])
    .executeTakeFirstOrThrow()
  await db.updateTable('users').set({ info }).where('id', '=', row.id).execute()
  seededUserIds.push(row.id)
  seededUserUids.push(row.uid)
  return row
}

async function seedPost(user: SeededUser, content: string) {
  // posts.uid is typed never-insert but the table has no DB default, so the seed must supply one
  const uid = `test-p-${Math.random().toString(36).slice(2, 10)}`
  return await db
    .insertInto('posts')
    .values({ userUid: user.uid, userId: user.id, content, status: 'published', uid } as NewPostData)
    .returning(['id', 'uid'])
    .executeTakeFirstOrThrow()
}

async function seedComment(user: SeededUser, postId: number, content: string) {
  return await db
    .insertInto('comments')
    .values({
      uid: `test-c-${content.length}-${Math.random().toString(36).slice(2, 8)}`,
      postId,
      userUid: user.uid,
      userId: user.id,
      content
    })
    .returning(['id', 'uid'])
    .executeTakeFirstOrThrow()
}

beforeEach(() => {
  zipExists = false
  savedZips = []
  bucketImages = []
  deleteFilesCalls = []
  getFilesError = undefined
})

afterAll(async () => {
  // FK order: children first (deleteUserData removes its own target; this sweeps the bystanders)
  if (seededUserIds.length > 0) {
    await db
      .deleteFrom('comments')
      .where((eb) =>
        eb.or([
          eb('userUid', 'in', seededUserUids),
          eb('postId', 'in', db.selectFrom('posts').select('id').where('userUid', 'in', seededUserUids))
        ])
      )
      .execute()
    await db.deleteFrom('postTargets').where('userUid', 'in', seededUserUids).execute()
    await db
      .deleteFrom('favorites')
      .where((eb) => eb.or([eb('userUid', 'in', seededUserUids), eb('friendUid', 'in', seededUserUids)]))
      .execute()
    await db
      .deleteFrom('relations')
      .where((eb) => eb.or([eb('userUid', 'in', seededUserUids), eb('friendUid', 'in', seededUserUids)]))
      .execute()
    await db.deleteFrom('posts').where('userUid', 'in', seededUserUids).execute()
    await db.deleteFrom('accountValidationTokens').where('userId', 'in', seededUserIds).execute()
    await db.deleteFrom('passwordRecoveryTokens').where('userId', 'in', seededUserIds).execute()
    await db.deleteFrom('users').where('id', 'in', seededUserIds).execute()
  }
  bucketSpy.mockRestore()
  await db.destroy()
})

describe('downloadUserData', () => {
  test('zips profile, posts (with audience), comments, and images, and returns the bucket URL', async () => {
    const user = await seedUser('dl')
    const post = await seedPost(user, 'first post')
    await db
      .insertInto('postTargets')
      .values({ postId: post.id, postUid: post.uid, userId: user.id, userUid: user.uid, type: 'favorites' })
      .execute()
    const comment = await seedComment(user, post.id, 'my comment')
    bucketImages = [{ name: `${user.uid}/profile-abc.jpg`, contents: Buffer.from([1, 2, 3, 4]) }]

    const url = await api.downloadUserData(user.uid)

    const dateStamp = DateFns.format(new Date(), 'yyyy-MM-dd')
    const zipPath = `user_data/dt=${dateStamp}/${user.uid}_data.zip`
    // the full base (including the bucket path segment) is preserved even without a trailing slash
    expect(url).toBe(`${config.baseImageUrl.replace(/\/$/, '')}/${zipPath}`)

    expect(savedZips.length).toBe(1)
    expect(savedZips[0].path).toBe(zipPath)

    const entries = unzipSync(new Uint8Array(savedZips[0].data))
    expect(Object.keys(entries).sort()).toEqual(['comments.ndjson', 'images/profile-abc.jpg', 'posts.ndjson', 'profile.json'])

    const profile = JSON.parse(strFromU8(entries['profile.json']))
    expect(profile.uid).toBe(user.uid)
    // the export must never include the password hash
    expect(profile.passwordHash).toBeUndefined()
    expect(profile.username).toBeDefined()

    const posts = strFromU8(entries['posts.ndjson'])
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(posts.length).toBe(1)
    expect(posts[0].uid).toBe(post.uid)
    expect(posts[0].content).toBe('first post')
    expect(posts[0].audience).toBe('favorites')

    const comments = strFromU8(entries['comments.ndjson'])
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(comments.length).toBe(1)
    expect(comments[0].uid).toBe(comment.uid)
    expect(comments[0].postUid).toBe(post.uid)

    expect(Buffer.from(entries['images/profile-abc.jpg'])).toEqual(Buffer.from([1, 2, 3, 4]))
  })

  test('an unknown uid throws UserDataError and saves nothing', async () => {
    const err = await api.downloadUserData(`test-missing-${suffix}`).catch((e) => e)
    expect(err).toBeInstanceOf(UserDataError)
    expect((err as UserDataError).errors.user).toEqual(['User not found'])
    expect(savedZips.length).toBe(0)
  })

  test('a second export on the same day is rejected', async () => {
    const user = await seedUser('dlagain')
    zipExists = true
    const err = await api.downloadUserData(user.uid).catch((e) => e)
    expect(err).toBeInstanceOf(UserDataError)
    expect((err as UserDataError).errors.export).toEqual(['You already exported your data today. You can only do it once a day.'])
    expect(savedZips.length).toBe(0)
  })

  test('a storage failure surfaces the generic export error', async () => {
    const user = await seedUser('dlfail')
    getFilesError = new Error('gcs down')
    const err = await api.downloadUserData(user.uid).catch((e) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(UserDataError)
    expect((err as Error).message).toBe('An unexpected error occurred while exporting user data.')
  })
})

describe('deleteUserData', () => {
  test('removes the user, their content, comments on their posts, and scrubs denormalized uid lists', async () => {
    const target = await seedUser('deltgt')
    const keptUid = `test-kept-${suffix}`
    const bystander = await seedUser('delby', {
      favorites: [target.uid, keptUid],
      relations: { approved: [target.uid, keptUid], disapproved: [target.uid] },
      bio: 'unrelated info stays'
    })

    const targetPost = await seedPost(target, 'target post')
    const bystanderPost = await seedPost(bystander, 'bystander post')
    await db
      .insertInto('postTargets')
      .values({ postId: targetPost.id, postUid: targetPost.uid, userId: target.id, userUid: target.uid, type: 'all' })
      .execute()

    // deleted: written by the target, and written by others on the target's posts
    await seedComment(target, bystanderPost.id, 'target on bystander post')
    await seedComment(bystander, targetPost.id, 'bystander on target post')
    const surviving = await seedComment(bystander, bystanderPost.id, 'bystander on own post')

    await db
      .insertInto('favorites')
      .values([
        { userId: bystander.id, userUid: bystander.uid, friendId: target.id, friendUid: target.uid },
        { userId: target.id, userUid: target.uid, friendId: bystander.id, friendUid: bystander.uid }
      ])
      .execute()
    await db
      .insertInto('relations')
      .values([
        { userId: bystander.id, userUid: bystander.uid, friendId: target.id, friendUid: target.uid, type: 'approve' },
        { userId: target.id, userUid: target.uid, friendId: bystander.id, friendUid: bystander.uid, type: 'approve' }
      ])
      .execute()
    await db
      .insertInto('accountValidationTokens')
      .values({ userId: target.id, token: `test-avt-${suffix}` })
      .execute()
    await db
      .insertInto('passwordRecoveryTokens')
      .values({ userId: target.id, token: `test-prt-${suffix}` })
      .execute()

    await api.deleteUserData(target.uid)

    expect(await db.selectFrom('users').select('id').where('uid', '=', target.uid).executeTakeFirst()).toBeUndefined()

    const bystanderRow = await db.selectFrom('users').select(['info']).where('id', '=', bystander.id).executeTakeFirstOrThrow()
    expect(bystanderRow.info).toEqual({
      favorites: [keptUid],
      relations: { approved: [keptUid], disapproved: [] },
      bio: 'unrelated info stays'
    })

    const posts = await db.selectFrom('posts').select('uid').where('userUid', 'in', [target.uid, bystander.uid]).execute()
    expect(posts.map((p) => p.uid)).toEqual([bystanderPost.uid])

    const comments = await db.selectFrom('comments').select('uid').where('userUid', 'in', [target.uid, bystander.uid]).execute()
    expect(comments.map((c) => c.uid)).toEqual([surviving.uid])

    const favorites = await db
      .selectFrom('favorites')
      .select('id')
      .where((eb) => eb.or([eb('userUid', '=', target.uid), eb('friendUid', '=', target.uid)]))
      .execute()
    expect(favorites.length).toBe(0)
    const relations = await db
      .selectFrom('relations')
      .select('id')
      .where((eb) => eb.or([eb('userUid', '=', target.uid), eb('friendUid', '=', target.uid)]))
      .execute()
    expect(relations.length).toBe(0)

    expect(await db.selectFrom('postTargets').select('id').where('userUid', '=', target.uid).execute()).toEqual([])
    expect(await db.selectFrom('accountValidationTokens').select('id').where('userId', '=', target.id).execute()).toEqual([])
    expect(await db.selectFrom('passwordRecoveryTokens').select('id').where('userId', '=', target.id).execute()).toEqual([])

    // images and prior export zips are removed after the DB commit
    expect(deleteFilesCalls).toEqual([
      { prefix: `${target.uid}/`, force: true },
      { prefix: 'user_data/', matchGlob: `user_data/dt=*/${target.uid}_data.zip`, force: true }
    ])
  })

  test('an unknown uid throws UserDataError and never touches storage', async () => {
    const err = await api.deleteUserData(`test-missing-${suffix}`).catch((e) => e)
    expect(err).toBeInstanceOf(UserDataError)
    expect((err as UserDataError).errors.user).toEqual(['User not found'])
    expect(deleteFilesCalls.length).toBe(0)
  })
})
