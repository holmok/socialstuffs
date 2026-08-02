import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely'

export type AccountValidationTable = {
  id: Generated<number>
  userId: ColumnType<number, number, never>
  token: ColumnType<string, string, never>
  claimed: ColumnType<Date, never, Date>
  created: ColumnType<Date, never, never>
}

export type AccountValidationData = Selectable<AccountValidationTable>
export type NewAccountValidationData = Insertable<AccountValidationTable>
export type AccountValidationUpdateData = Updateable<AccountValidationTable>
