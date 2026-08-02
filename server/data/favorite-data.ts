import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely'

export type FavoriteTable = {
  id: Generated<number>
  userId: ColumnType<number, number, never>
  userUid: ColumnType<string, string, never>
  friendId: ColumnType<number, number, never>
  friendUid: ColumnType<string, string, never>
  created: ColumnType<Date, never, never>
}

export type FavoriteData = Selectable<FavoriteTable>
export type NewFavoriteData = Insertable<FavoriteTable>
export type FavoriteUpdateData = Updateable<FavoriteTable>
