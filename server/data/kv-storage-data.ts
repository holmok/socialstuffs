import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely'

export type KvStoreTable = {
  id: Generated<number>
  key: ColumnType<string, string, never>
  value: ColumnType<string, string, string>
  created: ColumnType<Date, never, never>
  expires: ColumnType<Date, Date, Date>
}

export type KeyValueData = Selectable<KvStoreTable>
export type NewKeyValueData = Insertable<KvStoreTable>
export type KeyValueUpdateData = Updateable<KvStoreTable>
