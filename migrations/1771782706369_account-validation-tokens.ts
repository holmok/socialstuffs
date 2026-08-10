import type { MigrationBuilder } from 'node-pg-migrate'

const accountValidationTokens = { schema: 'socialstuffs', name: 'accountValidationTokens' }
const users = { schema: 'socialstuffs', name: 'users' }

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(accountValidationTokens, {
    id: { type: 'serial', primaryKey: true },
    userId: { type: 'integer', notNull: true, references: users },
    token: { type: 'text', notNull: true },
    claimed: { type: 'timestamptz' },
    created: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('current_timestamp')
    }
  })

  pgm.createIndex(accountValidationTokens, 'token', {
    name: 'idxAccountValidationTokensToken',
    unique: true
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex(accountValidationTokens, 'token', {
    name: 'idxAccountValidationTokensToken',
    unique: true
  })

  pgm.dropTable(accountValidationTokens)
}
