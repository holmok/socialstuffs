import { describe, expect, test } from 'bun:test'
import pino from 'pino'
import LoadConfig, { envSchema } from '@/config'

// Builds a real pino logger from the config's pino options against a capture stream,
// so we exercise the actual `redact` config LoadConfig() ships.
function captureLog(record: Record<string, unknown>): Record<string, unknown> {
  const config = LoadConfig()
  const lines: string[] = []
  const stream = { write: (s: string) => lines.push(s) }
  const logger = pino(config.pino, stream as unknown as NodeJS.WritableStream)
  logger.info(record, 'test')
  return JSON.parse(lines[0])
}

describe('config pino redaction', () => {
  test('logger constructs from config without throwing', () => {
    expect(() => LoadConfig().pino).not.toThrow()
    expect(() => captureLog({ ok: true })).not.toThrow()
  })

  test('redacts request cookie/authorization headers but keeps the url route prefix', () => {
    const out = captureLog({
      req: {
        url: '/validate-account/SECRETTOKEN/42',
        method: 'GET',
        headers: { cookie: 'sid=abc', authorization: 'Bearer SECRET' }
      }
    })
    const req = out.req as { url: string; headers: { cookie: string; authorization: string } }
    // route prefix survives so path observability is retained; only token/id segments masked
    expect(req.url).toBe('/validate-account/[redacted]/[redacted]')
    expect(req.url).not.toContain('SECRETTOKEN')
    expect(req.headers.cookie).toBe('[redacted]')
    expect(req.headers.authorization).toBe('[redacted]')
  })

  test('masks token segments in nested urls and passwordHash in arrays', () => {
    const out = captureLog({
      data: { url: 'https://app/validate/LIVETOKEN' },
      existingUsers: [{ id: 1, username: 'bob', passwordHash: '$2b$SECRET' }]
    })
    const data = out.data as { url: string }
    const users = out.existingUsers as Array<{ passwordHash: string; username: string }>
    expect(data.url).not.toContain('LIVETOKEN')
    expect(data.url).toContain('[redacted]')
    expect(users[0].passwordHash).toBe('[redacted]')
    expect(users[0].username).toBe('bob')
  })

  test('redacts top-level password/token/passwordHash', () => {
    const out = captureLog({ password: 'plaintext', token: 'RAWTOKEN', passwordHash: 'HASH' })
    expect(out.password).toBe('[redacted]')
    expect(out.token).toBe('[redacted]')
    expect(out.passwordHash).toBe('[redacted]')
  })
})

describe('config poolConfig', () => {
  test('sets pool timeouts', () => {
    const { poolConfig } = LoadConfig()
    expect(poolConfig.connectionTimeoutMillis).toBe(5000)
    expect(poolConfig.idleTimeoutMillis).toBe(30000)
  })
})

describe('config coerced numerics', () => {
  test('numeric env vars are coerced to numbers', () => {
    const config = LoadConfig()
    expect(typeof config.server.port).toBe('number')
    expect(typeof config.poolConfig.max).toBe('number')
    expect(typeof config.poolConfig.min).toBe('number')
  })

  test('exposes the resolved log level', () => {
    expect(['debug', 'info', 'warn', 'error']).toContain(LoadConfig().logLevel)
  })

  test('rejects non-numeric, zero, and negative numerics (safeParse path)', () => {
    // process.env supplies all other required vars; we override only the field under test
    expect(envSchema.safeParse({ ...process.env, PORT: 'abc' }).success).toBe(false)
    expect(envSchema.safeParse({ ...process.env, PORT: '0' }).success).toBe(false)
    expect(envSchema.safeParse({ ...process.env, PORT: '-1' }).success).toBe(false)
    expect(envSchema.safeParse({ ...process.env, DATABASE_MAX_CLIENTS: 'lots' }).success).toBe(false)
  })

  test('accepts a valid numeric override', () => {
    const parsed = envSchema.safeParse({ ...process.env, PORT: '8080' })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.PORT).toBe(8080)
  })

  test('accepts DATABASE_MIN_CLIENTS=0 (a pool min of 0 is valid)', () => {
    const parsed = envSchema.safeParse({ ...process.env, DATABASE_MIN_CLIENTS: '0' })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.DATABASE_MIN_CLIENTS).toBe(0)
  })
})
