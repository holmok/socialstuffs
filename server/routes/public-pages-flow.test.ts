import { afterAll, describe, expect, test } from 'bun:test'
import pino from 'pino'
import LoadConfig from '@/config'
import { createApp } from '@/server'

const config = LoadConfig()
const logger = pino({ level: 'silent' })
const { app, db } = createApp(config, logger)

afterAll(async () => {
  await db.destroy()
})

describe('info pages', () => {
  const pages: [string, string][] = [
    ['/about', 'Remember when sharing was just sharing?'],
    ['/contact', 'Contact Us'],
    ['/terms', 'Terms of Service'],
    ['/privacy', 'Privacy Policy']
  ]

  for (const [path, title] of pages) {
    test(`GET ${path} returns 200 with its title`, async () => {
      const res = await app.request(`http://localhost${path}`)
      expect(res.status).toBe(200)
      const body = await res.text()
      expect(body).toContain(title)
    })
  }
})

describe('CSRF rejection', () => {
  test('a cross-origin form POST gets the styled 403 error page, not a bare fragment', async () => {
    const res = await app.request('http://localhost/sign-in', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: 'http://evil.example'
      },
      body: new URLSearchParams({ email: 'a@example.com', password: 'x' }).toString()
    })
    expect(res.status).toBe(403)
    const body = await res.text()
    // full styled page: layout chrome plus the error page markup, not hono's bare "Forbidden"
    expect(body).toContain('<!DOCTYPE html>')
    expect(body).toContain('<style>')
    expect(body).toContain('class="error-page"')
    expect(body).toContain('class="status-code"')
    expect(body).toContain('403')
  })
})
