import type { MigrationBuilder } from 'node-pg-migrate'

const relations = { schema: 'socialstuffs', name: 'relations' }
const users = { schema: 'socialstuffs', name: 'users' }

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createType('relation_type', ['approve', 'disapprove'])

  pgm.createTable(relations, {
    id: { type: 'serial', primaryKey: true },
    user_id: { type: 'integer', notNull: true, references: users },
    user_uid: { type: 'text', notNull: true },
    friend_id: { type: 'integer', notNull: true, references: users },
    friend_uid: { type: 'text', notNull: true },
    type: { type: 'relation_type', notNull: true },
    created: { type: 'timestamptz', notNull: true, default: pgm.func('current_timestamp') },
    updated: { type: 'timestamptz', notNull: false }
  })

  pgm.addConstraint(relations, 'unique_user_friend_uid', {
    unique: ['user_uid', 'friend_uid']
  })
  pgm.createIndex(relations, 'user_uid', { name: 'idx_relations_user_uid' })
  pgm.createIndex(relations, 'friend_uid', { name: 'idx_relations_friend_uid' })
  pgm.createIndex(relations, 'type', { name: 'idx_relations_type' })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex(relations, 'user_uid', { name: 'idx_relations_user_uid' })
  pgm.dropIndex(relations, 'friend_uid', { name: 'idx_relations_friend_uid' })
  pgm.dropIndex(relations, 'type', { name: 'idx_relations_type' })

  pgm.dropConstraint(relations, 'unique_user_friend_uid')
  pgm.dropTable(relations)
  pgm.dropType('relation_type')
}
