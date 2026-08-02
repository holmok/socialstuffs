import type { PoolConfig } from 'pg'
import type pino from 'pino'
import { z } from 'zod'

const APP_NAME = 'bun-hono-htmx'

const envSchema = z.object({
  PORT: z
    .string()
    .default('3000')
    .transform((val) => Number(val)),
  HOST: z.string().default('localhost'),
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOG_NAME: z.string().default(APP_NAME),
  DATABASE_URL: z.string(),
  DATABASE_SCHEMA: z.string(),
  DATABASE_MAX_CLIENTS: z
    .string()
    .default('10')
    .transform((val) => Number(val)),
  DATABASE_MIN_CLIENTS: z
    .string()
    .default('1')
    .transform((val) => Number(val)),
  AXIOM_DATASET: z.string(),
  AXIOM_TOKEN: z.string(),
  POSTMARK_TOKEN: z.string(),
  FROM_EMAIL: z.string(),
  BASE_LINK_URL: z.string().default('http://localhost:3000'),
  BASE_IMAGE_URL: z.string().default('https://storage.googleapis.com/social-stuffs-images')
})

export type Config = ReturnType<typeof LoadConfig>

export default function LoadConfig() {
  const env = envSchema.parse(process.env)

  const poolConfig: PoolConfig = {
    connectionString: env.DATABASE_URL,
    max: env.DATABASE_MAX_CLIENTS,
    min: env.DATABASE_MIN_CLIENTS
  }

  const devPinoOptions: pino.LoggerOptions = {
    name: env.LOG_NAME,
    level: 'debug',
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
    formatters: {
      level(label) {
        return { level: label }
      }
    }
  }

  return {
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
