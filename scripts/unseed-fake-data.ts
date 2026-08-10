// Hard-deletes everything scripts/seed-fake-data.ts recorded in scripts/seeded-data.json:
// the seeded users, all their posts and post targets, any relations/favorites touching them
// (including rows real users may have created toward seeded users, so the user deletes satisfy FKs),
// and any validation/recovery tokens. Deletes the manifest file when done.
// Run with: bun run scripts/unseed-fake-data.ts
// The sub-APIs deliberately expose no hard deletes, so this dev-only script uses Kysely directly.

import { unlink } from 'node:fs/promises'
import getDatabase from '@data/index'
import pino from 'pino'
import LoadConfig from '@/config'
import { MANIFEST_PATH, readManifest } from './seed-manifest'

const manifest = await readManifest()
if (manifest == null) {
  console.log(`nothing to unseed — ${MANIFEST_PATH} not found`)
  process.exit(0)
}

const userUids = manifest.users.map((u) => u.uid)
if (userUids.length === 0) {
  console.log('manifest has no users — deleting it and exiting')
  await unlink(MANIFEST_PATH)
  process.exit(0)
}

const config = LoadConfig()
const logger = pino({ level: 'warn' })
const db = getDatabase(config.poolConfig, config.dbSchema, logger)

try {
  // Deleting by seeded-user uid (not just the recorded rows) so nothing is left dangling
  // if a seeded user gained posts/relations/favorites after seeding. FK order: children first.
  const seededIds = db.selectFrom('users').select('id').where('uid', 'in', userUids)

  // comments written by seeded users, plus any comments (from anyone) on seeded users' posts
  const comments = await db
    .deleteFrom('comments')
    .where((eb) =>
      eb.or([
        eb('userUid', 'in', userUids),
        eb('postId', 'in', db.selectFrom('posts').select('id').where('userUid', 'in', userUids))
      ])
    )
    .executeTakeFirst()
  const postTargets = await db.deleteFrom('postTargets').where('userUid', 'in', userUids).executeTakeFirst()
  const favorites = await db
    .deleteFrom('favorites')
    .where((eb) => eb.or([eb('userUid', 'in', userUids), eb('friendUid', 'in', userUids)]))
    .executeTakeFirst()
  const relations = await db
    .deleteFrom('relations')
    .where((eb) => eb.or([eb('userUid', 'in', userUids), eb('friendUid', 'in', userUids)]))
    .executeTakeFirst()
  const posts = await db.deleteFrom('posts').where('userUid', 'in', userUids).executeTakeFirst()
  const validationTokens = await db.deleteFrom('accountValidationTokens').where('userId', 'in', seededIds).executeTakeFirst()
  const recoveryTokens = await db.deleteFrom('passwordRecoveryTokens').where('userId', 'in', seededIds).executeTakeFirst()
  const users = await db.deleteFrom('users').where('uid', 'in', userUids).executeTakeFirst()

  console.log(`deleted ${comments.numDeletedRows} comments`)
  console.log(`deleted ${postTargets.numDeletedRows} post targets`)
  console.log(`deleted ${favorites.numDeletedRows} favorites`)
  console.log(`deleted ${relations.numDeletedRows} relations`)
  console.log(`deleted ${posts.numDeletedRows} posts`)
  console.log(`deleted ${validationTokens.numDeletedRows} validation tokens`)
  console.log(`deleted ${recoveryTokens.numDeletedRows} recovery tokens`)
  console.log(`deleted ${users.numDeletedRows} users`)

  await unlink(MANIFEST_PATH)
  console.log(`removed ${MANIFEST_PATH}`)
} finally {
  await db.destroy()
}
