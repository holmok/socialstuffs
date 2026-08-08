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

describe('errorHandler / notFoundHandler HTMX handling', () => {
  test('HTMX request hitting the global error handler does not swap over the form target', async () => {
    const res = await app.request('http://localhost/bogus-endpoint-xyz', {
      headers: { 'HX-Request': 'true', 'HX-Target': 'sign-in-form' }
    })
    const body = await res.text()

    expect(res.status).toBe(404)
    // Reswap:none tells htmx to leave the triggering form (and what the user typed) untouched.
    expect(res.headers.get('HX-Reswap')).toBe('none')
    // The error is delivered out-of-band as a flash, not as a body that replaces the target.
    expect(body).toContain('hx-swap-oob="beforebegin:main"')
    expect(body).toContain('flash-item flash-error')
    expect(body).not.toContain('class="error-fragment"')
  })

  test('non-HTMX request hitting the global error handler still gets the full error page', async () => {
    const res = await app.request('http://localhost/bogus-endpoint-xyz')
    const body = await res.text()

    expect(res.status).toBe(404)
    expect(res.headers.get('HX-Reswap')).toBeNull()
    expect(body).toContain('<html')
    expect(body).toContain('404')
  })

  test('HTMX 401 still redirects to /sign-in and does not set HX-Reswap', async () => {
    const res = await app.request('http://localhost/user', {
      headers: { 'HX-Request': 'true' }
    })

    expect(res.status).toBe(401)
    expect(res.headers.get('HX-Redirect')).toBe('/sign-in')
    expect(res.headers.get('HX-Reswap')).toBeNull()
  })
})
