import type { MigrationBuilder } from 'node-pg-migrate'

const posts = { schema: 'socialstuffs', name: 'posts' }

export async function up(pgm: MigrationBuilder): Promise<void> {
  // the home feed filters status='published' and sorts created DESC, id DESC; profile pages sort
  // one author's posts the same way. The composite indexes serve those scans; the old standalone
  // status index matched most rows and never helped, so it goes.
  pgm.createIndex(posts, ['status', { name: 'created', sort: 'DESC' }, { name: 'id', sort: 'DESC' }], {
    name: 'idx_posts_status_created_id'
  })
  pgm.createIndex(posts, ['userUid', { name: 'created', sort: 'DESC' }], { name: 'idx_posts_userUid_created' })
  pgm.dropIndex(posts, 'status', { name: 'idx_posts_status' })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.createIndex(posts, 'status', { name: 'idx_posts_status' })
  pgm.dropIndex(posts, ['userUid'], { name: 'idx_posts_userUid_created' })
  pgm.dropIndex(posts, ['status'], { name: 'idx_posts_status_created_id' })
}
