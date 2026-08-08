import { afterAll, describe, expect, test } from 'bun:test'
import data from '@data/index'
import pino from 'pino'
import { z } from 'zod'
import LoadConfig from '@/config'
import { sweepExpiredKv, validateFormData } from '@/utils'

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

const formSchema = z.object({
  email: z.email({ error: 'Invalid email address' }),
  age: z.coerce.number().int().positive()
})

describe('validateFormData (F27 / tasks.md 6.2)', () => {
  test('returns success with parsed data for valid input', () => {
    const result = validateFormData({ email: 'a@b.com', age: '21' }, formSchema)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ email: 'a@b.com', age: 21 })
      expect(result.errors).toEqual({})
    }
  })

  test('returns flattened fieldErrors for invalid input', () => {
    const result = validateFormData({ email: 'nope', age: '-1' }, formSchema)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.email).toEqual(['Invalid email address'])
      expect(result.errors.age?.length).toBeGreaterThan(0)
      // original (unparsed) data is echoed back so the form can be re-rendered
      expect(result.data).toEqual({ email: 'nope', age: '-1' })
    }
  })
})
