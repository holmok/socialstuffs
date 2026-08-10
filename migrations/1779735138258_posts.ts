import type { MigrationBuilder } from 'node-pg-migrate'

const posts = { schema: 'socialstuffs', name: 'posts' }
const users = { schema: 'socialstuffs', name: 'users' }

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createType('post_status', ['draft', 'published', 'archived', 'deleted'])

  pgm.createTable(posts, {
    id: { type: 'serial', primaryKey: true },
    uid: { type: 'text', notNull: true, unique: true },
    userUid: { type: 'text', notNull: true },
    userId: { type: 'integer', notNull: true, references: users, onDelete: 'NO ACTION' },
    content: { type: 'text', notNull: true },
    imageUrl: { type: 'text', notNull: false },
    linkUrl: { type: 'text', notNull: false },
    linkText: { type: 'text', notNull: false },
    status: { type: 'post_status', notNull: true, default: 'published' },
    updated: { type: 'timestamp', notNull: false, default: pgm.func('current_timestamp') },
    created: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') }
  })

  pgm.createIndex(posts, 'userUid', { name: 'idx_posts_userUid' })
  pgm.createIndex(posts, 'status', { name: 'idx_posts_status' })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex(posts, 'userUid', { name: 'idx_posts_userUid' })
  pgm.dropIndex(posts, 'status', { name: 'idx_posts_status' })
  pgm.dropTable(posts)
  pgm.dropType('post_status')
}
