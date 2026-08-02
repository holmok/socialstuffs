import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely'

export type CachedDataType = Record<string, unknown> | Array<unknown> | string | number | boolean | null

export type CachedQueriesTable = {
  id: Generated<number>
  key: ColumnType<string, string, never>
  expires: ColumnType<Date, Date, Date>
  data: ColumnType<CachedDataType, CachedDataType, CachedDataType>
}

export type CachedQueriesData = Selectable<CachedQueriesTable>
export type NewCachedQueriesData = Insertable<CachedQueriesTable>
export type CachedQueriesUpdateData = Updateable<CachedQueriesTable>
