import type { MigrationBuilder } from 'node-pg-migrate'

const postTargets = { schema: 'socialstuffs', name: 'post_targets' }
const posts = { schema: 'socialstuffs', name: 'posts' }
const users = { schema: 'socialstuffs', name: 'users' }

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createType('post_target_type', ['favorites', 'approved', 'non_disapproved', 'all'])
  pgm.createTable(postTargets, {
    id: { type: 'serial', primaryKey: true },
    post_id: { type: 'integer', notNull: true, references: posts },
    post_uid: { type: 'text', notNull: true },
    user_id: { type: 'integer', notNull: true, references: users },
    user_uid: { type: 'text', notNull: true },
    type: { type: 'post_target_type', notNull: true },
    created: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') },
    updated: { type: 'timestamp', notNull: false }
  })

  pgm.addConstraint(postTargets, 'post_targets_unique_post_user_uid', {
    unique: ['post_uid', 'user_uid']
  })

  pgm.createIndex(postTargets, 'post_uid', { name: 'idx_post_targets_post_uid' })
  pgm.createIndex(postTargets, 'user_uid', { name: 'idx_post_targets_user_uid' })
  pgm.createIndex(postTargets, 'type', { name: 'idx_post_targets_type' })
  pgm.createIndex(postTargets, 'created', { name: 'idx_post_targets_created' })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex(postTargets, 'created', { name: 'idx_post_targets_created' })
  pgm.dropIndex(postTargets, 'post_uid', { name: 'idx_post_targets_post_uid' })
  pgm.dropIndex(postTargets, 'user_uid', { name: 'idx_post_targets_user_uid' })
  pgm.dropIndex(postTargets, 'type', { name: 'idx_post_targets_type' })
  pgm.dropConstraint(postTargets, 'post_targets_unique_post_user_uid')
  pgm.dropTable(postTargets)
  pgm.dropType('post_target_type')
}
