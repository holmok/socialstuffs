import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely'

export type PasswordRecoveryTable = {
  id: Generated<number>
  userId: ColumnType<number, number, never>
  token: ColumnType<string, string, never>
  claimed: ColumnType<Date | null, never, Date>
  created: ColumnType<Date, never, never>
}

export type PasswordRecoveryData = Selectable<PasswordRecoveryTable>
export type NewPasswordRecoveryData = Insertable<PasswordRecoveryTable>
export type PasswordRecoveryUpdateData = Updateable<PasswordRecoveryTable>
