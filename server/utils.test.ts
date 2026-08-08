import { afterAll, describe, expect, test } from 'bun:test'
import data from '@data/index'
import pino from 'pino'
import LoadConfig from '@/config'
import { sweepExpiredKv } from '@/utils'

const config = LoadConfig()
const logger = pino({ level: 'silent' })
const db = data(config.poolConfig, config.dbSchema, logger)

const suffix = Math.random().toString(36).slice(2, 10)
const expiredKey = `sweep-expired-${suffix}`
const freshKey = `sweep-fresh-${suffix}`

afterAll(async () => {
  await db.deleteFrom('kvStorage').where('key', 'in', [expiredKey, freshKey]).execute()
  await db.destroy()
})

describe('sweepExpiredKv', () => {
  test('deletes expired rows and leaves fresh ones', async () => {
    await db
      .insertInto('kvStorage')
      .values([
        { key: expiredKey, value: '{}', expires: new Date(Date.now() - 60 * 1000) },
        { key: freshKey, value: '{}', expires: new Date(Date.now() + 60 * 60 * 1000) }
      ])
      .execute()

    await sweepExpiredKv(db, logger)

    const expired = await db.selectFrom('kvStorage').where('key', '=', expiredKey).selectAll().executeTakeFirst()
    const fresh = await db.selectFrom('kvStorage').where('key', '=', freshKey).selectAll().executeTakeFirst()

    expect(expired).toBeUndefined()
    expect(fresh).toBeDefined()
  })
})
