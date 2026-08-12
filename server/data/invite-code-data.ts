import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely'

export type InviteCodeTable = {
  id: Generated<number>
  // updateable so an owner can refresh an unclaimed code
  code: ColumnType<string, string, string>
  createdBy: ColumnType<number, number, never>
  claimedBy: ColumnType<number | null, never, number>
  created: ColumnType<Date, never, never>
  claimed: ColumnType<Date | null, never, Date>
}

export type InviteCodeData = Selectable<InviteCodeTable>
export type NewInviteCodeData = Insertable<InviteCodeTable>
export type InviteCodeUpdateData = Updateable<InviteCodeTable>
