import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely'

export type KvStoreTable = {
  id: Generated<number>
  key: ColumnType<string, string, never>
  value: string
  created: ColumnType<Date, never, never>
  expires: Date
}

export type KeyValueData = Selectable<KvStoreTable>
export type NewKeyValueData = Insertable<KvStoreTable>
export type KeyValueUpdateData = Updateable<KvStoreTable>
