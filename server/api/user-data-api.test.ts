import { afterAll, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import UserDataAPI, { UserDataError } from '@api/user-data-api'
import data from '@data/index'
import type { NewPostData } from '@data/post-data'
import type { UserMeta, UserProfileInfo } from '@data/user-data'
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

// fake GCS bucket: records saves/deletes instead of talking to Google; getFiles honors the
// prefix so the export listing (user_data/) and the image listing (<uid>/) stay distinct
let savedZips: { path: string; data: Buffer }[] = []
let bucketFiles: { name: string; contents: Buffer }[] = []
let deletedFiles: string[] = []
let deleteFilesCalls: Record<string, unknown>[] = []
let getFilesError: Error | undefined

const fakeBucket = {
  file: (path: string) => ({
    save: async (buffer: Buffer) => {
      savedZips.push({ path, data: buffer })
    }
  }),
  getFiles: async (opts: { prefix: string }) => {
    if (getFilesError) throw getFilesError
    return [
      bucketFiles
        .filter((f) => f.name.startsWith(opts.prefix))
        .map((f) => ({
          name: f.name,
          download: async () => [f.contents],
          delete: async () => {
            deletedFiles.push(f.name)
          }
        }))
    ]
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

async function seedUser(name: string, info: UserProfileInfo & UserMeta = {}): Promise<SeededUser> {
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
  savedZips = []
  bucketFiles = []
  deletedFiles = []
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
    bucketFiles = [{ name: `${user.uid}/profile-abc.jpg`, contents: Buffer.from([1, 2, 3, 4]) }]

    const url = await api.downloadUserData(user.uid)

    expect(savedZips.length).toBe(1)
    const dateStamp = DateFns.format(new Date(), 'yyyy-MM-dd')
    // the path carries a random token so export URLs are not enumerable from the public uid + date
    expect(savedZips[0].path).toMatch(new RegExp(`^user_data/dt=${dateStamp}/[^/]{32}_${user.uid}_data\\.zip$`))
    // the full base (including the bucket path segment) is preserved even without a trailing slash
    expect(url).toBe(`${config.baseImageUrl.replace(/\/$/, '')}/${savedZips[0].path}`)

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

  test('more images than the download concurrency all land in the zip (chunk boundary math)', async () => {
    const user = await seedUser('dlmany')
    // 9 images = two full chunks of IMAGE_DOWNLOAD_CONCURRENCY (4) plus a partial final chunk
    bucketFiles = Array.from({ length: 9 }, (_, i) => ({
      name: `${user.uid}/photo-${i}.jpg`,
      contents: Buffer.from([i])
    }))

    await api.downloadUserData(user.uid)

    expect(savedZips.length).toBe(1)
    const entries = unzipSync(new Uint8Array(savedZips[0].data))
    for (let i = 0; i < 9; i++) {
      expect(Buffer.from(entries[`images/photo-${i}.jpg`])).toEqual(Buffer.from([i]))
    }
  })

  test('an unknown uid throws UserDataError and saves nothing', async () => {
    const err = await api.downloadUserData(`test-missing-${suffix}`).catch((e) => e)
    expect(err).toBeInstanceOf(UserDataError)
    expect((err as UserDataError).errors.user).toEqual(['User not found'])
    expect(savedZips.length).toBe(0)
  })

  test('a second export on the same day is rejected', async () => {
    const user = await seedUser('dlagain')
    const dateStamp = DateFns.format(new Date(), 'yyyy-MM-dd')
    bucketFiles = [{ name: `user_data/dt=${dateStamp}/sometoken_${user.uid}_data.zip`, contents: Buffer.alloc(0) }]
    const err = await api.downloadUserData(user.uid).catch((e) => e)
    expect(err).toBeInstanceOf(UserDataError)
    expect((err as UserDataError).errors.export).toEqual(['You already exported your data today. You can only do it once a day.'])
    expect(savedZips.length).toBe(0)
  })

  test('older exports — including legacy predictable paths — are deleted; other users’ are kept', async () => {
    const user = await seedUser('dlclean')
    bucketFiles = [
      { name: `user_data/dt=2020-01-01/${user.uid}_data.zip`, contents: Buffer.alloc(0) },
      { name: `user_data/dt=2020-01-02/oldtoken_${user.uid}_data.zip`, contents: Buffer.alloc(0) },
      { name: `user_data/dt=2020-01-02/othertoken_someone-else_data.zip`, contents: Buffer.alloc(0) }
    ]

    await api.downloadUserData(user.uid)

    expect(deletedFiles.sort()).toEqual([
      `user_data/dt=2020-01-01/${user.uid}_data.zip`,
      `user_data/dt=2020-01-02/oldtoken_${user.uid}_data.zip`
    ])
    expect(savedZips.length).toBe(1)
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
  test("removes the user, their content, and comments on their posts; other users' info is untouched", async () => {
    const target = await seedUser('deltgt')
    const bystander = await seedUser('delby', { bio: 'unrelated info stays' })

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
    expect(bystanderRow.info).toEqual({ bio: 'unrelated info stays' })

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
      { prefix: 'user_data/', matchGlob: `user_data/dt=*/*${target.uid}_data.zip`, force: true }
    ])
  })

  test('an unknown uid throws UserDataError and never touches storage', async () => {
    const err = await api.deleteUserData(`test-missing-${suffix}`).catch((e) => e)
    expect(err).toBeInstanceOf(UserDataError)
    expect((err as UserDataError).errors.user).toEqual(['User not found'])
    expect(deleteFilesCalls.length).toBe(0)
  })
})
