import type { MigrationBuilder } from 'node-pg-migrate'

// Cloud SQL API-created users (like the app user "website") are members of
// cloudsqlsuperuser, but that role does not bypass Postgres ACLs: the
// socialstuffs schema and its tables are owned by "migrator", so the app user
// needs explicit grants. Runs as "migrator", so the ALTER DEFAULT PRIVILEGES
// statements cover objects created by future migrations too.

const appUser = 'website'
const schema = 'socialstuffs'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`GRANT USAGE ON SCHEMA ${schema} TO ${appUser}`)
  pgm.sql(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${appUser}`)
  pgm.sql(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${appUser}`)
  pgm.sql(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${appUser}`
  )
  pgm.sql(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT USAGE, SELECT ON SEQUENCES TO ${appUser}`
  )
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} REVOKE USAGE, SELECT ON SEQUENCES FROM ${appUser}`
  )
  pgm.sql(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM ${appUser}`
  )
  pgm.sql(`REVOKE USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${schema} FROM ${appUser}`)
  pgm.sql(`REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schema} FROM ${appUser}`)
  pgm.sql(`REVOKE USAGE ON SCHEMA ${schema} FROM ${appUser}`)
}
