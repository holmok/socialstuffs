import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { sql } from 'kysely'
import pino from 'pino'
import LoadConfig from '@/config'
import { createApp } from '@/server'

process.env.NODE_ENV = 'development'
const config = LoadConfig()
const logger = pino({ level: 'silent' })
const { app, db } = createApp(config, logger)

const suffix = Math.random().toString(36).slice(2, 10)

type SeededUser = { id: number; uid: string }

async function seedUser(name: string): Promise<SeededUser> {
  const username = `t_${name}_${suffix}`.slice(0, 15)
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
    .returning(['id', 'uid'])
    .executeTakeFirstOrThrow()
}

async function seedToken(userId: number, token: string) {
  return await db
    .insertInto('accountValidationTokens')
    .values({ token, userId })
    .returning(['id', 'userId'])
    .executeTakeFirstOrThrow()
}

async function tokenClaimed(token: string) {
  const row = await db
    .selectFrom('accountValidationTokens')
    .where('token', '=', token)
    .select(['claimed'])
    .executeTakeFirstOrThrow()
  return row.claimed
}

async function userStatus(id: number) {
  const row = await db.selectFrom('users').where('id', '=', id).select(['status']).executeTakeFirstOrThrow()
  return row.status
}

let decoy: SeededUser
let user: SeededUser
const decoyTokens = [`decoy-a-${suffix}`, `decoy-b-${suffix}`, `decoy-c-${suffix}`]
const mainToken = `main-${suffix}`
const otherToken = `other-${suffix}`
const expiredToken = `expired-${suffix}`

describe('/validate-account/:token/:uid', () => {
  beforeAll(async () => {
    // seed a decoy user with several tokens first so the token id sequence
    // diverges from the user id sequence (the original bug only surfaced then)
    decoy = await seedUser('decoy')
    for (const t of decoyTokens) {
      await seedToken(decoy.id, t)
    }
    user = await seedUser('main')
    const mainTokenRow = await seedToken(user.id, mainToken)
    await seedToken(user.id, otherToken)
    await seedToken(user.id, expiredToken)
    await sql`update ${sql.id(config.dbSchema, 'account_validation_tokens')}
      set created = now() - interval '49 hours'
      where token = ${expiredToken}`.execute(db)

    expect(mainTokenRow.id).not.toBe(user.id)
    expect(await userStatus(user.id)).toBe('pending')
  })

  afterAll(async () => {
    const userIds = [decoy?.id, user?.id].filter((id): id is number => id != null)
    if (userIds.length > 0) {
      await db.deleteFrom('accountValidationTokens').where('userId', 'in', userIds).execute()
      await db.deleteFrom('users').where('id', 'in', userIds).execute()
    }
    await db.destroy()
  })

  test('valid link activates the user and claims only the presented token', async () => {
    const res = await app.request(`/validate-account/${mainToken}/${user.uid}`)
    expect(res.status).toBe(200)
    expect(await userStatus(user.id)).toBe('active')
    expect(await tokenClaimed(mainToken)).not.toBeNull()
    expect(await tokenClaimed(otherToken)).toBeNull()
    for (const t of decoyTokens) {
      expect(await tokenClaimed(t)).toBeNull()
    }
    expect(await userStatus(decoy.id)).toBe('pending')
  })

  test('second use of the same link fails', async () => {
    const res = await app.request(`/validate-account/${mainToken}/${user.uid}`)
    expect(res.status).toBe(400)
  })

  test('wrong uid fails and does not claim the token', async () => {
    const res = await app.request(`/validate-account/${otherToken}/${decoy.uid}`)
    expect(res.status).toBe(400)
    expect(await tokenClaimed(otherToken)).toBeNull()
    expect(await userStatus(decoy.id)).toBe('pending')
  })

  test('token older than 48 hours fails', async () => {
    const res = await app.request(`/validate-account/${expiredToken}/${user.uid}`)
    expect(res.status).toBe(400)
    expect(await tokenClaimed(expiredToken)).toBeNull()
  })

  test('unknown token fails', async () => {
    const res = await app.request(`/validate-account/nope-${suffix}/${user.uid}`)
    expect(res.status).toBe(400)
  })
})
