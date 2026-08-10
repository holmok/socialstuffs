import type { MigrationBuilder } from 'node-pg-migrate'

const users = { schema: 'socialstuffs', name: 'users' }

export async function up(pgm: MigrationBuilder): Promise<void> {
  // create types / enums
  pgm.createType('user_status', ['pending', 'active', 'deleted', 'inactive'])
  pgm.createType('user_role', ['user', 'admin', 'owner'])

  // create users table
  pgm.createTable(users, {
    id: { type: 'serial', primaryKey: true },
    uid: { type: 'text', notNull: true },
    email: { type: 'text', notNull: true },
    username: { type: 'text', notNull: true },
    normalized_username: { type: 'text', notNull: true },
    normalized_email: { type: 'text', notNull: true },
    password_hash: { type: 'text', notNull: true },
    created: { type: 'timestamptz', notNull: true, default: pgm.func('CURRENT_TIMESTAMP') },
    updated: { type: 'timestamptz', notNull: false },
    status: { type: 'user_status', notNull: true, default: 'pending' },
    role: { type: 'user_role', notNull: true, default: 'user' },
    info: { type: 'jsonb', notNull: true, default: '{}' },
    preferences: { type: 'jsonb', notNull: true, default: '{}' },
    last_login: { type: 'timestamptz', notNull: false }
  })

  // create indexes
  pgm.createIndex(users, 'normalized_username', { name: 'idx_users_normalized_username', unique: true })
  pgm.createIndex(users, 'normalized_email', { name: 'idx_users_normalized_email', unique: true })
  pgm.createIndex(users, 'uid', { name: 'idx_users_uid', unique: true })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // drop indexes
  pgm.dropIndex(users, 'normalized_username', { name: 'idx_users_normalized_username', unique: true })
  pgm.dropIndex(users, 'normalized_email', { name: 'idx_users_normalized_email', unique: true })
  pgm.dropIndex(users, 'uid', { name: 'idx_users_uid', unique: true })

  // drop users table
  pgm.dropTable(users)

  // drop types / enums
  pgm.dropType('user_status')
  pgm.dropType('user_role')
}
