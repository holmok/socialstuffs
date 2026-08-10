import type { MigrationBuilder } from 'node-pg-migrate'

const cachedQueries = { schema: 'socialstuffs', name: 'cachedQueries' }

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(cachedQueries, {
    id: { type: 'serial', primaryKey: true },
    key: { type: 'text', notNull: true, unique: true },
    expires: { type: 'timestamptz', notNull: true },
    data: { type: 'jsonb', notNull: true }
  })
  pgm.createIndex(cachedQueries, 'key', { name: 'idx_cachedQueries_key' })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex(cachedQueries, 'key', { name: 'idx_cachedQueries_key' })
  pgm.dropTable(cachedQueries)
}
