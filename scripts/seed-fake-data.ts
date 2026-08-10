// One-off dev seeding: creates fake users, posts (with audience targets), comments, relations,
// and favorites. Run with: bun run scripts/seed-fake-data.ts
// All users get the password below so you can log in as any of them.
// Rows are written directly through Kysely (mirroring the flow tests), so seeding needs no
// Google credentials and skips the moderation pipeline the real routes run.
// Everything created is recorded in scripts/seeded-data.json (merged across reruns) so
// scripts/unseed-fake-data.ts can hard-delete it later.

import getDatabase, { type PostTargetType } from '@data/index'
import normalizeEmail from 'normalize-email'
import pino from 'pino'
import Uniquey from 'uniquey'
import LoadConfig from '@/config'
import { emptyManifest, MANIFEST_PATH, readManifest, type SeedManifest } from './seed-manifest'

const PASSWORD = 'Password123!'
const MAX_SEED_FAVORITES = 5

const PEOPLE = [
  { username: 'maya_torres', fullName: 'Maya Torres', bio: 'Plant hoarder. If it photosynthesizes, I own it.' },
  { username: 'dev_okafor', fullName: 'Devon Okafor', bio: 'Recovering barista. Latte art is my legacy.' },
  {
    username: 'lena.k',
    fullName: 'Lena Kowalski',
    bio: 'Trail runner and amateur mycologist.\nAsk me about mushrooms.'
  },
  {
    username: 'sam_the_baker',
    fullName: 'Sam Whitfield',
    bio: 'Sourdough evangelist. My starter is older than my car.'
  },
  { username: 'priya_codes', fullName: 'Priya Raman', bio: 'I make small websites for small businesses.' },
  { username: 'jrock', fullName: 'Jamal Rockwell', bio: 'Vinyl collector. 1200+ records and counting.' },
  { username: 'annika_v', fullName: 'Annika Voss', bio: 'Landscape photographer chasing golden hour.' },
  { username: 'teddy_b', fullName: 'Theo Barnes', bio: 'Dad of three. Grill master. Pun enthusiast.' },
  { username: 'carmen.diaz', fullName: 'Carmen Diaz', bio: 'Marathoner in training. Currently very tired.' },
  { username: 'oldsaltfisher', fullName: 'Gus Malloy', bio: 'Retired tugboat captain. Now I just fish and complain.' },
  { username: 'zoe_zines', fullName: 'Zoe Nakamura', bio: 'I make zines about public transit.' },
  {
    username: 'brew_kevin',
    fullName: 'Kevin O_Leary',
    bio: 'Homebrewer. My garage smells like a brewery because it is one.'
  }
] as const

const POST_TEXTS = [
  'Spent the whole morning at the farmers market and regret nothing.',
  'Hot take: cold pizza is better than reheated pizza.',
  'Finally finished that project I have been putting off since March. Feels incredible.',
  'Does anyone else just sit in the car for five minutes after getting home, or is that just me?',
  'Rainy day. Perfect excuse to stay in and do absolutely nothing.',
  'New personal record today! Small wins count.',
  'The sunset tonight was unreal. No photo could do it justice, but I tried anyway.',
  'Made way too much soup. Accepting volunteers.',
  'Note to self: do not start a new hobby the same week as a work deadline.',
  'Three-day weekend planning committee, assemble.',
  'I said I would only stay for one song. It is now 1am.',
  'My neighbor gave me a bag of tomatoes and now we are apparently best friends.',
  'Unpopular opinion: mornings are actually great once you are up.',
  'Trying to read more this year. Two books down, forty to go.',
  'The library is the best free thing your city offers and I will die on this hill.',
  'Learned to juggle this weekend. My ceiling fan did not survive.',
  'Coffee number three. No regrets yet. Ask again at 4pm.',
  'Cleaned the garage and found things I do not remember buying.',
  'First frost this morning. Winter is officially on notice.',
  'Just discovered my dog has strong opinions about jazz.'
]

const COMMENT_TEXTS = [
  'This is so relatable it hurts.',
  'Okay but tell me more about this.',
  'Absolutely agree. No notes.',
  'I laughed way harder at this than I should have.',
  'Strong disagree, but I respect the commitment.',
  'Saving this for later. Thank you.',
  'You put into words what I could not.',
  'Petition to make this a weekly update.',
  'This made my whole day, honestly.',
  'Been there. It does get better.',
  'Incredible. Simply incredible.',
  'I need a follow-up post immediately.',
  'My exact experience last weekend.',
  'Bold of you to say this publicly, and I love it.',
  'Reading this while doing the exact same thing.'
]

const LINKS = [
  { linkUrl: 'https://en.wikipedia.org/wiki/Sourdough', linkText: 'Sourdough deep dive' },
  { linkUrl: 'https://www.allrecipes.com', linkText: 'The recipe I mentioned' },
  { linkUrl: 'https://www.nps.gov', linkText: 'Trail info here' },
  { linkUrl: 'https://archive.org', linkText: 'Free stuff on the Internet Archive' },
  { linkUrl: 'https://xkcd.com', linkText: 'Relevant xkcd' }
]

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T
}

function shuffle<T>(arr: readonly T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const a = copy[i] as T
    copy[i] = copy[j] as T
    copy[j] = a
  }
  return copy
}

const config = LoadConfig()
const logger = pino({ level: 'warn' })
const db = getDatabase(config.poolConfig, config.dbSchema, logger)
const uniquey = new Uniquey() // short by design: public uid, not a secret

type Seeded = { id: number; uid: string; username: string; fullName: string; bio: string }

const manifest: SeedManifest = emptyManifest()

try {
  // 1. Users — reruns skip usernames that already exist
  const seeded: Seeded[] = []
  const passwordHash = await Bun.password.hash(PASSWORD, { algorithm: 'bcrypt', cost: 10 })
  for (const person of PEOPLE) {
    const email = `${person.username.replaceAll(/\W+/g, '.')}@example.com`
    const normalizedUsername = person.username.toLowerCase()
    const existing = await db
      .selectFrom('users')
      .select(['id'])
      .where('normalizedUsername', '=', normalizedUsername)
      .executeTakeFirst()
    if (existing != null) {
      console.log(`skipping ${person.username} (already exists)`)
      continue
    }
    const user = await db
      .insertInto('users')
      .values({
        uid: uniquey.create(),
        username: person.username,
        normalizedUsername,
        email,
        normalizedEmail: normalizeEmail(email),
        passwordHash
      })
      .returning(['id', 'uid'])
      .executeTakeFirstOrThrow()
    // status and info are not insertable; activate the account and write profile info via update
    await db
      .updateTable('users')
      .set({ status: 'active', info: { fullname: person.fullName, bio: person.bio } })
      .where('id', '=', user.id)
      .execute()
    seeded.push({ id: user.id, uid: user.uid, ...person })
    manifest.users.push({ uid: user.uid, username: person.username, email })
  }
  console.log(`created ${seeded.length} users`)

  // 2. Posts with their audience rows
  const publishedPosts: { id: number; uid: string }[] = []
  for (const user of seeded) {
    const n = randInt(2, 5)
    for (const content of shuffle(POST_TEXTS).slice(0, n)) {
      const withLink = Math.random() < 0.3 ? pick(LINKS) : {}
      const status = Math.random() < 0.85 ? ('published' as const) : ('draft' as const)
      const post = await db
        .insertInto('posts')
        .values({ uid: uniquey.create(), userId: user.id, userUid: user.uid, content, status, ...withLink })
        .returning(['id', 'uid'])
        .executeTakeFirstOrThrow()
      const target: PostTargetType = Math.random() < 0.7 ? 'all' : pick(['favorites', 'approved', 'non_disapproved'] as const)
      await db
        .insertInto('postTargets')
        .values({ postId: post.id, postUid: post.uid, userId: user.id, userUid: user.uid, type: target })
        .execute()
      manifest.posts.push(post.uid)
      if (status === 'published') publishedPosts.push(post)
    }
  }
  console.log(`created ${manifest.posts.length} posts`)

  // 2b. Comments on published posts, from random seeded users
  for (const post of publishedPosts) {
    for (const commenter of shuffle(seeded).slice(0, randInt(0, 4))) {
      const uid = uniquey.create()
      await db
        .insertInto('comments')
        .values({ uid, postId: post.id, userId: commenter.id, userUid: commenter.uid, content: pick(COMMENT_TEXTS) })
        .execute()
      manifest.comments.push(uid)
    }
  }
  console.log(`created ${manifest.comments.length} comments`)

  // 3. Relations + favorites
  for (const user of seeded) {
    const others = seeded.filter((u) => u.id !== user.id)
    for (const friend of shuffle(others).slice(0, randInt(4, 10))) {
      const type = Math.random() < 0.8 ? ('approve' as const) : ('disapprove' as const)
      await db
        .insertInto('relations')
        .values({ userId: user.id, userUid: user.uid, friendId: friend.id, friendUid: friend.uid, type })
        .execute()
      manifest.relations.push({ userUid: user.uid, friendUid: friend.uid })
    }
    if (Math.random() < 0.7) {
      for (const friend of shuffle(others).slice(0, randInt(2, MAX_SEED_FAVORITES))) {
        await db
          .insertInto('favorites')
          .values({ userId: user.id, userUid: user.uid, friendId: friend.id, friendUid: friend.uid })
          .execute()
        manifest.favorites.push({ userUid: user.uid, friendUid: friend.uid })
      }
    }
  }
  console.log(`created ${manifest.relations.length} relations and ${manifest.favorites.length} favorites`)

  // 4. Record what was created so unseed-fake-data.ts can hard-delete it. Merge with any
  // earlier manifest so reruns (which skip existing usernames) don't lose prior entries.
  const previous = await readManifest()
  if (previous != null) {
    const knownUsers = new Set(manifest.users.map((u) => u.uid))
    const knownPosts = new Set(manifest.posts)
    const knownComments = new Set(manifest.comments)
    const pairKey = (p: { userUid: string; friendUid: string }) => `${p.userUid}:${p.friendUid}`
    const knownRelations = new Set(manifest.relations.map(pairKey))
    const knownFavorites = new Set(manifest.favorites.map(pairKey))
    manifest.users.push(...previous.users.filter((u) => !knownUsers.has(u.uid)))
    manifest.posts.push(...previous.posts.filter((uid) => !knownPosts.has(uid)))
    manifest.comments.push(...previous.comments.filter((uid) => !knownComments.has(uid)))
    manifest.relations.push(...previous.relations.filter((p) => !knownRelations.has(pairKey(p))))
    manifest.favorites.push(...previous.favorites.filter((p) => !knownFavorites.has(pairKey(p))))
  }
  manifest.createdAt = new Date().toISOString()
  await Bun.write(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`wrote ${MANIFEST_PATH}`)
  console.log(`done — log in as any user (e.g. ${seeded[0]?.username}) with password: ${PASSWORD}`)
} finally {
  await db.destroy()
}
