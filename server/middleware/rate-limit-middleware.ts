import type { Context, MiddlewareHandler } from 'hono'
import { getConnInfo } from 'hono/bun'

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

// test-only: clears all rate-limit state (the map is module-level, shared across createApp() instances in one process)
export function __resetRateLimits() {
  windows.clear()
}

function clientIp(c: Context): string {
  // ngrok appends the observed client IP to X-Forwarded-For, so the LAST entry is the trustworthy one
  // (earlier entries are attacker-controlled)
  const parts = c.req.header('x-forwarded-for')?.split(',')
  const forwarded = parts?.[parts.length - 1]?.trim()
  if (forwarded) return forwarded
  try {
    return getConnInfo(c).remote.address ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

export function rateLimit({ windowMs, max, keyPrefix, onLimit }: RateLimitOptions): MiddlewareHandler {
  return async (c, next) => {
    const now = Date.now()
    for (const [key, window] of windows) {
      if (window.expires <= now) windows.delete(key)
    }
    if (windows.size > MAX_TRACKED_KEYS) windows.clear()
    const key = `${keyPrefix}:${clientIp(c)}`
    const window = windows.get(key)
    if (!window) {
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
