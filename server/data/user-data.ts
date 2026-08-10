import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely'

export type UserStatus = 'pending' | 'active' | 'deleted' | 'inactive'
export type UserRole = 'user' | 'admin' | 'owner'
export type UserMeta = Record<string, unknown>

// shape of the profile fields stored in the users.info JSON column
export type UserProfileInfo = {
  fullname?: string
  title?: string
  location?: string
  bio?: string
  profileImageUrl?: string
  lastExportUrl?: string
}

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
  // the open-record intersection keeps unknown keys (present in older rows) surviving round-trips
  info: ColumnType<UserProfileInfo & UserMeta, never, UserProfileInfo & UserMeta>
  preferences: ColumnType<UserMeta, never, UserMeta>
  lastLogin: ColumnType<Date | null, never, Date>
}

export type UserData = Selectable<UserTable>
export type NewUserData = Insertable<UserTable>
export type UserUpdateData = Updateable<UserTable>
