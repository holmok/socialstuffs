import type { MigrationBuilder } from 'node-pg-migrate'

const kvStorage = { schema: 'socialstuffs', name: 'kvStorage' }
const comments = { schema: 'socialstuffs', name: 'comments' }
const posts = { schema: 'socialstuffs', name: 'posts' }

export async function up(pgm: MigrationBuilder): Promise<void> {
  // key already carries a unique constraint (which brings its own index); the explicit second
  // index on the same column only doubled write cost on the busiest write table
  pgm.dropIndex(kvStorage, 'key', { name: 'idx_kvStorage_key' })
  // the hourly expiry sweep deletes on expires < now() — previously a full-table scan
  pgm.createIndex(kvStorage, 'expires', { name: 'idx_kvStorage_expires' })

  // tighten columns the Kysely types already promise are non-null; clean any strays first
  // (raw SQL uses the decamelized names the tables actually have)
  pgm.sql('DELETE FROM socialstuffs.kv_storage WHERE value IS NULL')
  pgm.alterColumn(kvStorage, 'value', { notNull: true })
  pgm.sql('DELETE FROM socialstuffs.comments WHERE post_id IS NULL')
  pgm.alterColumn(comments, 'postId', { notNull: true })
  pgm.sql('UPDATE socialstuffs.posts SET updated = created WHERE updated IS NULL')
  pgm.alterColumn(posts, 'updated', { notNull: true })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.alterColumn(posts, 'updated', { notNull: false })
  pgm.alterColumn(comments, 'postId', { notNull: false })
  pgm.alterColumn(kvStorage, 'value', { notNull: false })
  pgm.dropIndex(kvStorage, 'expires', { name: 'idx_kvStorage_expires' })
  pgm.createIndex(kvStorage, 'key', { name: 'idx_kvStorage_key' })
}
