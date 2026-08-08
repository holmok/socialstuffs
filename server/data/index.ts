import { CamelCasePlugin, Kysely, PostgresDialect, WithSchemaPlugin } from 'kysely'
import { Pool, type PoolConfig } from 'pg'
import type { Logger } from 'pino'
import type { AccountValidationTable } from './account-validation-token-data'
import type { CachedQueriesTable } from './cached-queries'
import type { CommentTable } from './comment-data'
import type { FavoriteTable } from './favorite-data'
import type { KvStoreTable } from './kv-storage-data'
import type { PasswordRecoveryTable } from './password-recovery-token-data'
import type { PostTable } from './post-data'
import type { PostTargetsTable } from './post-target-data'
import type { RelationsTable } from './relation-data'
import type { UserTable } from './user-data'

export * from './account-validation-token-data'
export * from './cached-queries'
export * from './comment-data'
export * from './favorite-data'
export * from './kv-storage-data'
export * from './password-recovery-token-data'
export * from './post-data'
export * from './post-target-data'
export * from './relation-data'
export * from './user-data'

export default function getDatabase(poolOptions: PoolConfig, schema: string, _logger: Logger) {
  const logger = _logger.child({ module: 'database' })
  logger.info('Initializing database connection')
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool(poolOptions)
    }),
    plugins: [new CamelCasePlugin(), new WithSchemaPlugin(schema)]
  })
}

export type Database = {
  kvStorage: KvStoreTable
  users: UserTable
  accountValidationTokens: AccountValidationTable
  passwordRecoveryTokens: PasswordRecoveryTable
  posts: PostTable
  relations: RelationsTable
  favorites: FavoriteTable
  postTargets: PostTargetsTable
  comments: CommentTable
  cachedQueries: CachedQueriesTable
}
