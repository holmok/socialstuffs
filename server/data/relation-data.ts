import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely'

export type RelationType = 'approve' | 'disapprove'

export type RelationsTable = {
  id: Generated<number>
  userId: ColumnType<number, number, never>
  userUid: ColumnType<string, string, never>
  friendId: ColumnType<number, number, never>
  friendUid: ColumnType<string, string, never>
  type: RelationType
  created: ColumnType<Date, never, never>
  updated: ColumnType<Date, never, never>
}

export type RelationsData = Selectable<RelationsTable>
export type NewRelationsData = Insertable<RelationsTable>
export type RelationsUpdateData = Updateable<RelationsTable>
