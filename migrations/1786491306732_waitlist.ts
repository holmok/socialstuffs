import type { MigrationBuilder } from 'node-pg-migrate'

const waitlist = { schema: 'socialstuffs', name: 'waitlist' }

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(waitlist, {
    id: { type: 'serial', primaryKey: true },
    email: { type: 'text', notNull: true },
    created: { type: 'timestamptz', notNull: true, default: pgm.func('current_timestamp') },
    sent: { type: 'timestamptz', notNull: false }
  })
  pgm.createIndex(waitlist, ['email'], { unique: true, name: 'waitlist_email_idx' })
  pgm.createIndex(waitlist, ['created'], { name: 'waitlist_created_idx' })
  pgm.createIndex(waitlist, ['sent'], { name: 'waitlist_sent_idx' })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex(waitlist, ['email'], { unique: true, name: 'waitlist_email_idx' })
  pgm.dropIndex(waitlist, ['created'], { name: 'waitlist_created_idx' })
  pgm.dropIndex(waitlist, ['sent'], { name: 'waitlist_sent_idx' })
  pgm.dropTable(waitlist)
}
