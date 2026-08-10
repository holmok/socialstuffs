import type { MigrationBuilder } from 'node-pg-migrate'

const passwordRecoveryTokens = { schema: 'socialstuffs', name: 'passwordRecoveryTokens' }
const users = { schema: 'socialstuffs', name: 'users' }

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(passwordRecoveryTokens, {
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

  pgm.createIndex(passwordRecoveryTokens, 'token', {
    name: 'idxPasswordRecoveryTokensToken',
    unique: true
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex(passwordRecoveryTokens, 'token', {
    name: 'idxPasswordRecoveryTokensToken',
    unique: true
  })

  pgm.dropTable(passwordRecoveryTokens)
}
