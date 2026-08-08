import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely'

export type UserStatus = 'pending' | 'active' | 'deleted' | 'inactive'
export type UserRole = 'user' | 'admin' | 'owner'
export type UserMeta = Record<string, unknown>

export type UserTable = {
  id: Generated<number>
  uid: ColumnType<string, string, never>
  email: string
  username: string
  normalizedUsername: string
  normalizedEmail: string
  passwordHash: string
  created: ColumnType<Date, never, never>
  updated: ColumnType<Date, never, Date>
  status: ColumnType<UserStatus, never, UserStatus>
  role: ColumnType<UserRole, never, UserRole>
  info: ColumnType<UserMeta, never, UserMeta>
  preferences: ColumnType<UserMeta, never, UserMeta>
  lastLogin: ColumnType<Date | null, never, Date>
}

export type UserData = Selectable<UserTable>
export type NewUserData = Insertable<UserTable>
export type UserUpdateData = Updateable<UserTable>
