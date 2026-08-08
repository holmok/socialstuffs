import type { PoolConfig } from 'pg'
import type pino from 'pino'
import { z } from 'zod'

const APP_NAME = 'socialstuffs'

export const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('localhost'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOG_NAME: z.string().default(APP_NAME),
  DATABASE_URL: z.url(),
  DATABASE_SCHEMA: z.string().min(1),
  DATABASE_MAX_CLIENTS: z.coerce.number().int().positive().default(10),
  DATABASE_MIN_CLIENTS: z.coerce.number().int().nonnegative().default(1),
  AXIOM_DATASET: z.string().min(1),
  AXIOM_TOKEN: z.string().min(1),
  POSTMARK_TOKEN: z.string().min(1),
  FROM_EMAIL: z.email(),
  BASE_LINK_URL: z.url().default('http://localhost:3000'),
  BASE_IMAGE_URL: z.url().default('https://storage.googleapis.com/social-stuffs-images'),
  JWT_SECRET: z.string().min(1),
  COOKIE_SECRET: z.string().min(1),
  COOKIE_NAME_USER: z.string().min(1),
  COOKIE_NAME_SESSION: z.string().min(1)
})

export type Config = ReturnType<typeof LoadConfig>

export default function LoadConfig() {
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    console.error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`)
    process.exit(1)
  }
  const env = parsed.data

  const poolConfig: PoolConfig = {
    connectionString: env.DATABASE_URL,
    max: env.DATABASE_MAX_CLIENTS,
    min: env.DATABASE_MIN_CLIENTS,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000
  }

  // Defense-in-depth: scrub secrets/PII from any log object regardless of where it appears.
  // hono-pino logs req.headers (cookie/authorization) and req.url (which carries the
  // account-validation token in its path); handlers may log user rows (passwordHash) or tokens.
  // Wildcards match one path segment, so both `*.field` and `*.*.field` are needed to reach
  // fields nested inside arrays/objects (e.g. existingUsers[0].passwordHash).
  const redact: pino.redactOptions = {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'password',
      'passwordHash',
      'token',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.url',
      '*.*.password',
      '*.*.passwordHash',
      '*.*.token'
    ],
    // A plain string censor on `*.url` would wipe hono-pino's req.url on every request,
    // losing all route observability. For url fields keep the route prefix and mask only the
    // deeper (token/id) segments; everything else gets a plain censor.
    censor: (value, path) => {
      if (path[path.length - 1] === 'url' && typeof value === 'string') {
        return value
          .split('/')
          .map((seg, i) => (i <= 1 ? seg : '[redacted]'))
          .join('/')
      }
      return '[redacted]'
    }
  }

  const devPinoOptions: pino.LoggerOptions = {
    name: env.LOG_NAME,
    level: 'debug',
    redact,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        singleLine: true,
        messageKey: 'msg',
        levelFirst: true,
        ignore: 'pid,hostname,req.headers,req.remoteAddress,req.remotePort',
        translateTime: true
      }
    }
  }

  const productionPinoOptions: pino.LoggerOptions = {
    name: env.LOG_NAME,
    level: env.LOG_LEVEL,
    redact,
    formatters: {
      level(label) {
        return { level: label }
      }
    }
  }

  return {
    auth: {
      jwtSecret: env.JWT_SECRET,
      cookieSecret: env.COOKIE_SECRET,
      userCookieName: env.COOKIE_NAME_USER,
      sessionCookieName: env.COOKIE_NAME_SESSION
    },
    baseLinkUrl: env.BASE_LINK_URL,
    baseImageUrl: env.BASE_IMAGE_URL,
    email: {
      postmarkToken: env.POSTMARK_TOKEN,
      fromEmail: env.FROM_EMAIL
    },
    poolConfig,
    axiom: {
      dataset: env.AXIOM_DATASET,
      token: env.AXIOM_TOKEN
    },
    dbSchema: env.DATABASE_SCHEMA,
    logLevel: env.LOG_LEVEL,
    server: {
      port: env.PORT,
      host: env.HOST
    },
    mode: {
      isDev: env.NODE_ENV === 'development',
      isProd: env.NODE_ENV === 'production',
      env: env.NODE_ENV
    },
    pino: env.NODE_ENV === 'development' ? devPinoOptions : productionPinoOptions
  }
}
