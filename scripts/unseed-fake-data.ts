// Hard-deletes everything scripts/seed-fake-data.ts recorded in scripts/seeded-data.json:
// the seeded users, all their posts and post targets, any relations/favorites touching them
// (including rows real users may have created toward seeded users, so the user deletes satisfy FKs),
// any validation/recovery tokens, their invite codes, and the seeded waitlist entries.
// Deletes the manifest file when done.
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
  // created_by would cascade with the user deletes anyway; explicit so the count is reported
  // (codes created by real users but claimed by seeded users survive via ON DELETE SET NULL)
  const inviteCodes = await db.deleteFrom('inviteCodes').where('createdBy', 'in', seededIds).executeTakeFirst()
  // seeded waitlist rows are keyed by email in the manifest; claimed_by references to seeded
  // users on any other waitlist rows fall back to NULL when the users are deleted
  const waitlist =
    manifest.waitlist.length > 0
      ? await db.deleteFrom('waitlist').where('email', 'in', manifest.waitlist).executeTakeFirst()
      : { numDeletedRows: 0n }
  const users = await db.deleteFrom('users').where('uid', 'in', userUids).executeTakeFirst()

  console.log(`deleted ${comments.numDeletedRows} comments`)
  console.log(`deleted ${postTargets.numDeletedRows} post targets`)
  console.log(`deleted ${favorites.numDeletedRows} favorites`)
  console.log(`deleted ${relations.numDeletedRows} relations`)
  console.log(`deleted ${posts.numDeletedRows} posts`)
  console.log(`deleted ${validationTokens.numDeletedRows} validation tokens`)
  console.log(`deleted ${recoveryTokens.numDeletedRows} recovery tokens`)
  console.log(`deleted ${inviteCodes.numDeletedRows} invite codes`)
  console.log(`deleted ${waitlist.numDeletedRows} waitlist entries`)
  console.log(`deleted ${users.numDeletedRows} users`)

  await unlink(MANIFEST_PATH)
  console.log(`removed ${MANIFEST_PATH}`)
} finally {
  await db.destroy()
}
