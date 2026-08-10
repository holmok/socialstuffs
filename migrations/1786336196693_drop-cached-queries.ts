import type { MigrationBuilder } from 'node-pg-migrate'

// cachedQueries was created speculatively (1784466114593_cached-queries.ts) and never got a
// Kysely type or a single code reference — drop it. down recreates it exactly as the original.
const cachedQueries = { schema: 'socialstuffs', name: 'cachedQueries' }

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex(cachedQueries, 'key', { name: 'idx_cachedQueries_key' })
  pgm.dropTable(cachedQueries)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(cachedQueries, {
    id: { type: 'serial', primaryKey: true },
    key: { type: 'text', notNull: true, unique: true },
    expires: { type: 'timestamptz', notNull: true },
    data: { type: 'jsonb', notNull: true }
  })
  pgm.createIndex(cachedQueries, 'key', { name: 'idx_cachedQueries_key' })
}
