import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely'

export type WaitlistTable = {
  id: Generated<number>
  email: ColumnType<string, string, never>
  created: ColumnType<Date, never, never>
  sent: ColumnType<Date | null, never, Date>
  code: ColumnType<string | null, never, string>
  claimed: ColumnType<Date | null, never, Date>
  claimed_by: ColumnType<number | null, never, number>
}

export type WaitlistData = Selectable<WaitlistTable>
export type NewWaitlistData = Insertable<WaitlistTable>
export type WaitlistUpdateData = Updateable<WaitlistTable>
