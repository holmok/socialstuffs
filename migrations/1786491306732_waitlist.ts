import type { MigrationBuilder } from 'node-pg-migrate'

const waitlist = { schema: 'socialstuffs', name: 'waitlist' }
const users = { schema: 'socialstuffs', name: 'users' }

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(waitlist, {
    id: { type: 'serial', primaryKey: true },
    email: { type: 'text', notNull: true },
    created: { type: 'timestamptz', notNull: true, default: pgm.func('current_timestamp') },
    sent: { type: 'timestamptz', notNull: false },
    code: { type: 'text', notNull: false },
    claimed: { type: 'timestamptz', notNull: false },
    claimed_by: { type: 'integer', notNull: false, references: users, onDelete: 'SET NULL' }
  })
  pgm.createIndex(waitlist, ['email'], { unique: true, name: 'waitlist_email_idx' })
  pgm.createIndex(waitlist, ['created'], { name: 'waitlist_created_idx' })
  pgm.createIndex(waitlist, ['sent'], { name: 'waitlist_sent_idx' })
  pgm.createIndex(waitlist, ['code'], { name: 'waitlist_code_idx' })
  pgm.createIndex(waitlist, ['claimed'], { name: 'waitlist_claimed_idx' })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex(waitlist, ['email'], { unique: true, name: 'waitlist_email_idx' })
  pgm.dropIndex(waitlist, ['created'], { name: 'waitlist_created_idx' })
  pgm.dropIndex(waitlist, ['sent'], { name: 'waitlist_sent_idx' })
  pgm.dropIndex(waitlist, ['code'], { name: 'waitlist_code_idx' })
  pgm.dropIndex(waitlist, ['claimed'], { name: 'waitlist_claimed_idx' })
  pgm.dropTable(waitlist)
}
