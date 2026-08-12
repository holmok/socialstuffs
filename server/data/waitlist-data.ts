import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely'

export type WaitlistTable = {
  id: Generated<number>
  email: ColumnType<string, string, never>
  created: ColumnType<Date, never, never>
  // null in the update types so an admin revoke can clear an outstanding invite
  sent: ColumnType<Date | null, never, Date | null>
  code: ColumnType<string | null, never, string | null>
  claimed: ColumnType<Date | null, never, Date>
  claimedBy: ColumnType<number | null, never, number>
}

export type WaitlistData = Selectable<WaitlistTable>
export type NewWaitlistData = Insertable<WaitlistTable>
export type WaitlistUpdateData = Updateable<WaitlistTable>
