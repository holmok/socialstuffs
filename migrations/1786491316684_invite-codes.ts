import type { MigrationBuilder } from 'node-pg-migrate'

const inviteCodes = { schema: 'socialstuffs', name: 'invite_codes' }
const users = { schema: 'socialstuffs', name: 'users' }

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(inviteCodes, {
    id: { type: 'serial', primaryKey: true },
    code: { type: 'text', notNull: true },
    created_by: { type: 'integer', notNull: true, references: users, onDelete: 'CASCADE' },
    claimed_by: { type: 'integer', notNull: false, references: users, onDelete: 'SET NULL' },
    created: { type: 'timestamptz', notNull: true, default: pgm.func('current_timestamp') },
    claimed: { type: 'timestamptz', notNull: false }
  })

  pgm.createIndex(inviteCodes, ['code'], { unique: true, name: 'invite_codes_code_idx' })
  pgm.createIndex(inviteCodes, ['created_by'], { name: 'invite_codes_created_by_idx' })
  pgm.createIndex(inviteCodes, ['claimed_by'], { name: 'invite_codes_claimed_by_idx' })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex(inviteCodes, ['code'], { unique: true, name: 'invite_codes_code_idx' })
  pgm.dropIndex(inviteCodes, ['created_by'], { name: 'invite_codes_created_by_idx' })
  pgm.dropIndex(inviteCodes, ['claimed_by'], { name: 'invite_codes_claimed_by_idx' })

  pgm.dropTable(inviteCodes)
}
