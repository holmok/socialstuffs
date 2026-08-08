import { afterAll, describe, expect, test } from 'bun:test'
import pino from 'pino'
import LoadConfig from '@/config'
import { createApp } from '@/server'

const base = LoadConfig()
const prodConfig = { ...base, mode: { ...base.mode, isProd: true } }
const logger = pino({ level: 'silent' })
const { app, db } = createApp(prodConfig, logger)

afterAll(async () => {
  await db.destroy()
})

describe('staticCache + etag', () => {
  test('versioned htmx asset is 200 with an ETag and an immutable one-year cache', async () => {
    const res = await app.request('http://localhost/js/htmx.min.2.0.10.js')
    expect(res.status).toBe(200)
    expect(res.headers.get('ETag')).toBeTruthy()
    const cacheControl = res.headers.get('Cache-Control') ?? ''
    expect(cacheControl).toContain('immutable')
    expect(cacheControl).toContain('max-age=31536000')
  })

  test('a matching If-None-Match returns 304', async () => {
    const first = await app.request('http://localhost/js/htmx.min.2.0.10.js')
    const tag = first.headers.get('ETag')
    expect(tag).toBeTruthy()
    const res = await app.request('http://localhost/js/htmx.min.2.0.10.js', {
      headers: { 'If-None-Match': tag as string }
    })
    expect(res.status).toBe(304)
  })

  test('unversioned own script gets a moderate cache, not immutable', async () => {
    const res = await app.request('http://localhost/js/nav.js')
    expect(res.status).toBe(200)
    const cacheControl = res.headers.get('Cache-Control') ?? ''
    expect(cacheControl).toBe('public, max-age=86400')
    expect(cacheControl).not.toContain('immutable')
  })

  test('a dynamic page does not inherit the static Cache-Control', async () => {
    const res = await app.request('http://localhost/')
    expect(res.status).toBe(200)
    const cacheControl = res.headers.get('Cache-Control') ?? ''
    expect(cacheControl).not.toContain('immutable')
    expect(cacheControl).not.toContain('max-age=31536000')
    expect(cacheControl).not.toContain('max-age=86400')
  })

  test('rendered page references the versioned htmx path', async () => {
    const res = await app.request('http://localhost/')
    const html = await res.text()
    expect(html).toContain('/js/htmx.min.2.0.10.js')
    expect(html).not.toContain('/js/htmx.min.js"')
  })
})
