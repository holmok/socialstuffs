import type { Database } from '@data/index'
import type { Context, MiddlewareHandler } from 'hono'
import { getConnInfo } from 'hono/bun'
import { type Kysely, sql } from 'kysely'

type RateLimitOptions = {
  windowMs: number
  max: number
  keyPrefix: string
  onLimit?: (c: Context) => Response | Promise<Response>
}

type RateWindow = { count: number; expires: number }

// safety valve: spoofed X-Forwarded-For values create new keys, so cap the map to bound memory under a key-flood
const MAX_TRACKED_KEYS = 10_000

const windows = new Map<string, RateWindow>()

// eviction is lazy: the requested key is checked on access, and a full O(n) sweep runs at most
// once per SWEEP_INTERVAL_MS — plus on demand when the map hits MAX_TRACKED_KEYS, so expired
// junk can't wedge the cap — instead of scanning the whole map on every rate-limited request
const SWEEP_INTERVAL_MS = 60_000
let lastSweep = 0

function sweepExpired(now: number) {
  for (const [key, window] of windows) {
    if (window.expires <= now) windows.delete(key)
  }
  lastSweep = now
}

// test-only: clears all rate-limit state (the map is module-level, shared across createApp() instances in one process)
export function __resetRateLimits() {
  windows.clear()
  lastSweep = 0
}

// test-only: fills the map with unexpired filler keys to exercise the MAX_TRACKED_KEYS overflow path
export function __fillRateLimitKeys(count: number, ttlMs: number) {
  const expires = Date.now() + ttlMs
  for (let i = 0; i < count; i++) {
    windows.set(`__filler:${i}`, { count: 1, expires })
  }
}

function clientIp(c: Context): string {
  // X-Forwarded-For is client-supplied and only meaningful behind a proxy that appends the
  // observed client IP as the LAST entry (the production ngrok tunnel does; earlier entries are
  // attacker-controlled). TRUST_PROXY=false ignores it entirely so a directly-exposed server
  // can't have its per-IP limits rotated away by spoofed headers.
  if (c.var.config.server.trustProxy) {
    const parts = c.req.header('x-forwarded-for')?.split(',')
    const forwarded = parts?.[parts.length - 1]?.trim()
    if (forwarded) return forwarded
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

export function rateLimit({ windowMs, max, keyPrefix, onLimit }: RateLimitOptions): MiddlewareHandler {
  return async (c, next) => {
    const now = Date.now()
    if (now - lastSweep >= SWEEP_INTERVAL_MS) sweepExpired(now)
    const key = `${keyPrefix}:${clientIp(c)}`
    let window = windows.get(key)
    if (window && window.expires <= now) {
      // lazy per-key eviction: an expired window starts fresh without waiting for a sweep
      windows.delete(key)
      window = undefined
    }
    if (!window) {
      // at capacity: sweep first so a map full of expired junk can't wedge the cap
      if (windows.size >= MAX_TRACKED_KEYS) sweepExpired(now)
      // at capacity even after the sweep (a key-flood): let new keys pass untracked rather than
      // wiping the map — clearing would reset every window, including ones actively blocking an attacker
      if (windows.size >= MAX_TRACKED_KEYS) return next()
      windows.set(key, { count: 1, expires: now + windowMs })
    } else if (window.count >= max) {
      c.var.logger.warn({ key }, 'Rate limit exceeded')
      c.status(429)
      return onLimit ? onLimit(c) : c.text('Too many attempts. Please try again later.')
    } else {
      window.count += 1
    }
    await next()
  }
}

type FailureLimitOptions = {
  windowMs: number
  max: number
  keyPrefix: string
}

// Per-identifier failed-attempt limiter backed by kvStorage, so it survives restarts and
// (unlike the per-IP limiter above) tracks a target across distributed source IPs.
// The caller decides what counts as a failure: check isBlocked() up front, recordFailure()
// on failed attempts, clear() on success. Expired rows are reaped by the hourly kv sweep.
export function failureLimit({ windowMs, max, keyPrefix }: FailureLimitOptions) {
  const keyFor = (id: string) => `${keyPrefix}:${id}`
  return {
    async isBlocked(db: Kysely<Database>, id: string): Promise<boolean> {
      const row = await db
        .selectFrom('kvStorage')
        .select('value')
        .where('key', '=', keyFor(id))
        .where('expires', '>', new Date())
        .executeTakeFirst()
      return row !== undefined && Number(row.value) >= max
    },
    async recordFailure(db: Kysely<Database>, id: string): Promise<void> {
      // atomic in-place increment while the window is open; otherwise start a fresh window.
      // Two concurrent first-failures can collapse into one count — a bounded undercount
      // at the window boundary only, harmless for a lockout threshold.
      const bumped = await db
        .updateTable('kvStorage')
        .set({ value: sql`(value::int + 1)::text` })
        .where('key', '=', keyFor(id))
        .where('expires', '>', new Date())
        .returning('value')
        .executeTakeFirst()
      if (!bumped) {
        const fresh = { key: keyFor(id), value: '1', expires: new Date(Date.now() + windowMs) }
        await db
          .insertInto('kvStorage')
          .values(fresh)
          .onConflict((oc) => oc.column('key').doUpdateSet({ value: fresh.value, expires: fresh.expires }))
          .execute()
      }
    },
    async clear(db: Kysely<Database>, id: string): Promise<void> {
      await db.deleteFrom('kvStorage').where('key', '=', keyFor(id)).execute()
    }
  }
}
