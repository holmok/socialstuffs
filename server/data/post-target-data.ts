import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely'

export type PostTargetType = 'favorites' | 'approved' | 'non_disapproved' | 'all'
export type PostTargetsTable = {
  id: Generated<number>
  postId: ColumnType<number, number, never>
  postUid: ColumnType<string, string, never>
  userId: ColumnType<number, number, never>
  userUid: ColumnType<string, string, never>
  type: ColumnType<PostTargetType, PostTargetType, PostTargetType>
  created: ColumnType<Date, never, never>
  updated: ColumnType<Date, never, never>
}

export type PostTargetData = Selectable<PostTargetsTable>
export type NewPostTargetData = Insertable<PostTargetsTable>
export type PostTargetUpdateData = Updateable<PostTargetsTable>
