import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely'

export type PostStatus = 'draft' | 'published' | 'archived' | 'deleted'

export type PostTable = {
  id: Generated<number>
  uid: ColumnType<string, never, never>
  userUid: ColumnType<string, string, never>
  userId: ColumnType<number, number, never>
  content: string
  imageUrl: ColumnType<string | null, string | undefined, string | null | undefined>
  linkUrl: ColumnType<string | null, string | undefined, string | null | undefined>
  linkText: ColumnType<string | null, string | undefined, string | null | undefined>
  status: PostStatus
  created: ColumnType<Date, never, never>
  updated: ColumnType<Date, never, Date>
}

export type PostData = Selectable<PostTable>
export type NewPostData = Insertable<PostTable>
export type PostUpdateData = Updateable<PostTable>
