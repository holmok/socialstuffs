// Shared between seed-fake-data.ts (writes) and unseed-fake-data.ts (reads + deletes).
import { join } from 'node:path'

export type SeedPair = { userUid: string; friendUid: string }

export type SeedManifest = {
  createdAt: string
  users: { uid: string; username: string; email: string }[]
  posts: string[]
  comments: string[]
  relations: SeedPair[]
  favorites: SeedPair[]
  // waitlist rows are recorded by email (their natural unique key)
  waitlist: string[]
}

export const MANIFEST_PATH = join(import.meta.dir, 'seeded-data.json')

export function emptyManifest(): SeedManifest {
  return { createdAt: '', users: [], posts: [], comments: [], relations: [], favorites: [], waitlist: [] }
}

export async function readManifest(): Promise<SeedManifest | null> {
  const file = Bun.file(MANIFEST_PATH)
  if (!(await file.exists())) return null
  const manifest = (await file.json()) as SeedManifest
  // manifests written before comments/waitlist existed lack the keys
  manifest.comments ??= []
  manifest.waitlist ??= []
  return manifest
}
