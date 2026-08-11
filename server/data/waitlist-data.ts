import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely'

export type WaitlistTable = {
  id: Generated<number>
  email: ColumnType<string, string, never>
  created: ColumnType<Date, never, never>
  sent: ColumnType<Date | null, never, Date>
}

export type WaitlistData = Selectable<WaitlistTable>
export type NewWaitlistData = Insertable<WaitlistTable>
export type WaitlistUpdateData = Updateable<WaitlistTable>
