import type { MigrationBuilder } from 'node-pg-migrate'

const posts = { schema: 'socialstuffs', name: 'posts' }
const users = { schema: 'socialstuffs', name: 'users' }
const comments = { schema: 'socialstuffs', name: 'comments' }

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(comments, {
    id: { type: 'serial', primaryKey: true },
    userUid: { type: 'text', notNull: true },
    userId: { type: 'integer', notNull: true, references: users, onDelete: 'NO ACTION' },
    postId: { type: 'integer', notNull: false, references: posts, onDelete: 'NO ACTION' },
    content: { type: 'text', notNull: true },
    created: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') }
  })

  pgm.createIndex(comments, 'postId', { name: 'idx_comments_postId' })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex(comments, 'postId', { name: 'idx_comments_postId' })
  pgm.dropTable(comments)
}
