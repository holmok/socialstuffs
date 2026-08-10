import { afterAll, describe, expect, test } from 'bun:test'
import getDatabase from '@data/index'
import pino from 'pino'
import Uniquey from 'uniquey'
import LoadConfig from '@/config'
import * as utils from '@/utils'
import { claimToken } from './token-helpers'

const config = LoadConfig()
const logger = pino({ level: 'silent' })
const db = getDatabase(config.poolConfig, config.dbSchema, logger)

const suffix = Math.random().toString(36).slice(2, 10)
const tokenUniquey = new Uniquey({ length: 32 })

async function seedUser(name: string) {
  const username = `u${name}${suffix}`.slice(0, 15)
  return await db
    .insertInto('users')
    .values({
      uid: `test-${name}-${suffix}`,
      username,
      normalizedUsername: username.toLowerCase(),
      email: `${name}-${suffix}@example.com`,
      normalizedEmail: `${name}-${suffix}@example.com`,
      passwordHash: 'not-a-real-hash'
    })
    .returning(['id'])
    .executeTakeFirstOrThrow()
}

async function insertToken(userId: number, opts: { created?: Date } = {}) {
  const token = tokenUniquey.create()
  await db.insertInto('accountValidationTokens').values({ token, userId }).execute()
  // `created` is not insertable in the Kysely types; backdate via update (cast past the `never`)
  if (opts.created) {
    await db
      .updateTable('accountValidationTokens')
      .set({ created: opts.created } as never)
      .where('token', '=', token)
      .execute()
  }
  return token
}

async function tokenClaimed(token: string) {
  const row = await db.selectFrom('accountValidationTokens').where('token', '=', token).select(['claimed']).executeTakeFirst()
  return row?.claimed ?? null
}

afterAll(async () => {
  const users = await db.selectFrom('users').where('normalizedEmail', 'like', `%${suffix}%`).select(['id']).execute()
  const ids = users.map((u) => u.id)
  if (ids.length > 0) {
    await db.deleteFrom('accountValidationTokens').where('userId', 'in', ids).execute()
    await db.deleteFrom('users').where('id', 'in', ids).execute()
  }
  await db.destroy()
})

describe('claimToken', () => {
  // the parity fix: validate-account's claim now carries the same freshness predicate as password
  // recovery, so an expired-but-unclaimed token can't be claimed even via the direct claim path
  test('an expired unclaimed validation token cannot be claimed', async () => {
    const user = await seedUser('expiredclaim')
    const old = new Date(Date.now() - 49 * 60 * 60 * 1000)
    const token = await insertToken(user.id, { created: old })

    const claim = await claimToken(db, 'accountValidationTokens', token, utils.TOKEN_TTL_MS)
    expect(claim).toBeUndefined()
    expect(await tokenClaimed(token)).toBeNull()
  })
})
