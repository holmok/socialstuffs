import type { MigrationBuilder } from 'node-pg-migrate'

const comments = { schema: 'socialstuffs', name: 'comments' }

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns(comments, {
    uid: { type: 'text', notNull: false },
    // stays null until the comment is edited — a non-null value means "edited"
    updated: { type: 'timestamptz', notNull: false }
  })
  // backfill any pre-existing rows, then lock the column down
  pgm.sql('UPDATE socialstuffs.comments SET uid = md5(random()::text || id::text) WHERE uid IS NULL')
  pgm.alterColumn(comments, 'uid', { notNull: true })
  pgm.addConstraint(comments, 'comments_uid_unique', { unique: ['uid'] })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropConstraint(comments, 'comments_uid_unique')
  pgm.dropColumns(comments, ['uid', 'updated'])
}
