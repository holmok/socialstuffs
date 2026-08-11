import type { MigrationBuilder } from 'node-pg-migrate'

const favorites = { schema: 'socialstuffs', name: 'favorites' }
const users = { schema: 'socialstuffs', name: 'users' }

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(favorites, {
    id: { type: 'serial', primaryKey: true },
    user_id: { type: 'integer', notNull: true, references: users },
    user_uid: { type: 'text', notNull: true },
    friend_id: { type: 'integer', notNull: true, references: users },
    friend_uid: { type: 'text', notNull: true },
    created: { type: 'timestamptz', notNull: true, default: pgm.func('current_timestamp') }
  })

  pgm.addConstraint(favorites, 'favorites_unique_user_friend_uid', {
    unique: ['user_uid', 'friend_uid']
  })
  pgm.createIndex(favorites, 'user_uid', { name: 'idx_favorites_user_uid' })
  pgm.createIndex(favorites, 'friend_uid', { name: 'idx_favorites_friend_uid' })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex(favorites, 'user_uid', { name: 'idx_favorites_user_uid' })
  pgm.dropIndex(favorites, 'friend_uid', { name: 'idx_favorites_friend_uid' })
  pgm.dropConstraint(favorites, 'favorites_unique_user_friend_uid')
  pgm.dropTable(favorites)
}
