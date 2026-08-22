import type { PoolConfig } from 'pg'
import type pino from 'pino'
import { z } from 'zod'

export const envSchema = z.object({
  PORT: z.coerce.number().int().positive(),
  HOST: z.string().min(1),
  // whether the app sits behind a proxy that appends the real client IP to X-Forwarded-For
  // (the production ngrok tunnel does); when false, forwarded headers are ignored as spoofable
  TRUST_PROXY: z.enum(['true', 'false']).transform((value) => value === 'true'),
  NODE_ENV: z.enum(['development', 'production', 'test']),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOG_NAME: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  DATABASE_SCHEMA: z.string().min(1),
  DATABASE_MAX_CLIENTS: z.coerce.number().int().positive().default(10),
  DATABASE_MIN_CLIENTS: z.coerce.number().int().nonnegative().default(1),
  AXIOM_DATASET: z.string().min(1),
  AXIOM_TOKEN: z.string().min(1),
  POSTMARK_TOKEN: z.string().min(1),
  FROM_EMAIL: z.email(),
  BASE_LINK_URL: z.url(),
  BASE_IMAGE_URL: z.url(),
  IMAGE_BUCKET: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  COOKIE_SECRET: z.string().min(1),
  COOKIE_NAME_USER: z.string().min(1),
  COOKIE_NAME_SESSION: z.string().min(1)
})

const languageThresholds = {
  Derogatory: 0.7, // Hate speech targeting identity
  Violent: 0.65, // Gore or physical threats
  'Death, Harm & Tragedy': 0.7, // Self-harm, mocking tragedies
  Toxic: 0.85, // Rude/unreasonable (High bar to allow venting)
  Insult: 0.6, // Inflammatory towards individuals
  Sexual: 0.7, // Lewd/NSFW content
  'Illicit Drugs': 0.8, // Sourcing/dealing (high threshold to allow medical/casual talk)
  Profanity: 0.92
}

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
    imageBucket: env.IMAGE_BUCKET,
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
      host: env.HOST,
      trustProxy: env.TRUST_PROXY
    },
    mode: {
      isDev: env.NODE_ENV === 'development',
      isProd: env.NODE_ENV === 'production',
      env: env.NODE_ENV
    },
    pino: env.NODE_ENV === 'development' ? devPinoOptions : productionPinoOptions,
    languageThresholds
  }
}
