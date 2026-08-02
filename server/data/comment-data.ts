import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely'

export type CommentTable = {
  id: Generated<number>
  uid: ColumnType<string, string, never>
  postId: ColumnType<number, number, never>
  userUid: ColumnType<string, string, never>
  userId: ColumnType<number, number, never>
  content: ColumnType<string, string, string>
  created: ColumnType<Date, never, never>
  updated: ColumnType<Date | null, never, Date>
}

export type CommentData = Selectable<CommentTable>
export type NewCommentData = Insertable<CommentTable>
export type CommentUpdateData = Updateable<CommentTable>
