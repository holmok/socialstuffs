import { describe, expect, test } from 'bun:test'
import pino from 'pino'
import LoadConfig from '@/config'

// Builds a real pino logger from the config's pino options against a capture stream,
// so we exercise the actual `redact` config LoadConfig() ships (F25 / tasks.md 3.5).
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
