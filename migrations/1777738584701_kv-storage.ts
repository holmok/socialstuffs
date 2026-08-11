import type { MigrationBuilder } from 'node-pg-migrate'

const kvStorage = { schema: 'socialstuffs', name: 'kvStorage' }

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(kvStorage, {
    id: { type: 'serial', primaryKey: true },
    key: { type: 'text', notNull: true, unique: true },
    value: { type: 'text', notNull: false },
    created: { type: 'timestamptz', notNull: true, default: pgm.func('current_timestamp') },
    expires: { type: 'timestamptz', notNull: true }
  })

  pgm.createIndex(kvStorage, 'key', { name: 'idx_kvStorage_key' })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex(kvStorage, 'key', { name: 'idx_kvStorage_key' })
  pgm.dropTable(kvStorage)
}
