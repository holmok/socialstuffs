import ProfileActions from '@components/profile/actions'
import type { RelationType } from '@data/relation-data'
import type { UserProfileInfo } from '@data/user-data'
import ProfileUserPage, { type ProfileFavorite } from '@pages/profile/user'
import type { Context, Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { Logger } from 'pino'
import * as m from '@/middleware'
import * as utils from '@/utils'

const POSTS_PER_PAGE = 5

// users without an uploaded photo get the shared placeholder image from the bucket (mirrors user-routes)
function displayImageUrl(info: UserProfileInfo, baseImageUrl: string) {
  const base = baseImageUrl.endsWith('/') ? baseImageUrl : `${baseImageUrl}/`
  return info.profileImageUrl ?? new URL('profile.jpg', base).href
}

// tallies received by the profile plus the viewer's own relation/favorite state, for the actions fragment
async function actionState(c: Context, viewerUid: string, profileUid: string) {
  const { db } = c.var
  const [counts, relation, favorite] = await Promise.all([
    db
      .selectFrom('relations')
      .select(['type'])
      .select((eb) => eb.fn.countAll<number>().as('total'))
      .where('friendUid', '=', profileUid)
      .groupBy('type')
      .execute(),
    db
      .selectFrom('relations')
      .select(['type'])
      .where('userUid', '=', viewerUid)
      .where('friendUid', '=', profileUid)
      .executeTakeFirst(),
    db
      .selectFrom('favorites')
      .select(['id'])
      .where('userUid', '=', viewerUid)
      .where('friendUid', '=', profileUid)
      .executeTakeFirst()
  ])
  return {
    approvals: Number(counts.find((row) => row.type === 'approve')?.total ?? 0),
    disapprovals: Number(counts.find((row) => row.type === 'disapprove')?.total ?? 0),
    relation: relation?.type ?? null,
    favorited: favorite != null
  }
}

// the action POSTs answer HTMX with a refreshed fragment and plain form posts with a redirect back to the profile
async function actionResponse(c: Context, viewerUid: string, profileUid: string) {
  if (c.req.header('HX-Request')) {
    const state = await actionState(c, viewerUid, profileUid)
    return c.html(ProfileActions({ profileUid, isSelf: false, ...state }))
  }
  return utils.redirect(c, `/profile/${profileUid}`)
}

// shared guards for the action POSTs: signed-in viewer, not acting on themselves, target exists and is active
async function loadParticipants(c: Context) {
  const uid = c.req.param('uid')
  if (uid == null) throw new HTTPException(404, { message: 'User not found' })
  const viewer = await c.var.auth.getUser()
  if (viewer == null) throw new HTTPException(401) // this should never happen due to the authorize middleware
  if (viewer.uid === uid) throw new HTTPException(400, { message: 'You cannot do that on your own profile.' })
  const target = await c.var.db
    .selectFrom('users')
    .select(['id', 'uid'])
    .where('uid', '=', uid)
    .where('status', '=', 'active')
    .executeTakeFirst()
  if (target == null) throw new HTTPException(404, { message: 'User not found' })
  return { viewer, target }
}

export default function ProfileRoutes(app: Hono, logger: Logger) {
  logger.info('Registering profile routes')
  const profile = app.basePath('/profile')
  profile.use('*', m.authorize({ requireAuth: true }))

  profile.get('/:uid', async (c) => {
    const uid = c.req.param('uid')
    const { db, auth, config } = c.var
    const viewerUid = auth.user?.uid
    if (viewerUid == null) throw new HTTPException(401) // this should never happen due to the authorize middleware

    const user = await db
      .selectFrom('users')
      .select(['id', 'uid', 'username', 'info', 'created'])
      .where('uid', '=', uid)
      .where('status', '=', 'active')
      .executeTakeFirst()
    if (user == null) throw new HTTPException(404, { message: 'User not found' })

    const info = { ...(user.info as UserProfileInfo) }
    info.profileImageUrl = displayImageUrl(info, config.baseImageUrl)

    // ?p=<page> drives the posts offset; anything unparseable or below 1 lands on page 1
    const page = Math.max(1, Number.parseInt(c.req.query('p') ?? '', 10) || 1)

    const [state, favoriteRows, posts, postCount] = await Promise.all([
      actionState(c, viewerUid, uid),
      db
        .selectFrom('favorites')
        .innerJoin('users', 'users.uid', 'favorites.friendUid')
        .select(['users.uid as uid', 'users.username as username', 'users.info as info'])
        .where('favorites.userUid', '=', uid)
        .where('users.status', '=', 'active')
        .orderBy('favorites.created', 'desc')
        .execute(),
      db
        .selectFrom('posts')
        .select(['uid', 'content', 'imageUrl', 'linkUrl', 'linkText', 'created', 'updated'])
        .where('userUid', '=', uid)
        .where('status', '=', 'published')
        // id breaks ties so posts created in the same instant keep a stable order across pages
        .orderBy('created', 'desc')
        .orderBy('id', 'desc')
        .limit(POSTS_PER_PAGE)
        .offset((page - 1) * POSTS_PER_PAGE)
        .execute(),
      db
        .selectFrom('posts')
        .select((eb) => eb.fn.countAll<number>().as('total'))
        .where('userUid', '=', uid)
        .where('status', '=', 'published')
        .executeTakeFirst()
    ])
    const totalPosts = Number(postCount?.total ?? 0)

    const favorites: ProfileFavorite[] = favoriteRows.map((row) => {
      const rowInfo = row.info as UserProfileInfo
      return {
        uid: row.uid,
        name: rowInfo.fullname ?? row.username,
        imageUrl: displayImageUrl(rowInfo, config.baseImageUrl)
      }
    })

    const name = info.fullname ?? user.username
    return c.render(
      ProfileUserPage({
        username: user.username,
        created: user.created,
        info,
        favorites,
        posts,
        page,
        hasNewer: page > 1,
        hasOlder: page * POSTS_PER_PAGE < totalPosts,
        actions: { profileUid: uid, isSelf: viewerUid === uid, ...state }
      }),
      {
        title: `Profile: ${name}`,
        description: `User profile page for ${name}.`,
        styles: ['user', 'profile']
      }
    )
  })

  // mutually exclusive toggle: same type again clears it, the other type switches it, none sets it
  const relate = (type: RelationType) => async (c: Context) => {
    const { viewer, target } = await loadParticipants(c)
    await c.var.db.transaction().execute(async (trx) => {
      const existing = await trx
        .selectFrom('relations')
        .select(['id', 'type'])
        .where('userUid', '=', viewer.uid)
        .where('friendUid', '=', target.uid)
        .executeTakeFirst()
      if (existing == null) {
        await trx
          .insertInto('relations')
          .values({ userId: viewer.id, userUid: viewer.uid, friendId: target.id, friendUid: target.uid, type })
          .execute()
      } else if (existing.type === type) {
        await trx.deleteFrom('relations').where('id', '=', existing.id).execute()
      } else {
        await trx.updateTable('relations').set({ type }).where('id', '=', existing.id).execute()
      }
    })
    c.var.logger.info({ uid: viewer.uid, friendUid: target.uid, type }, 'Profile relation toggled')
    return actionResponse(c, viewer.uid, target.uid)
  }

  profile.post('/:uid/approve', relate('approve'))
  profile.post('/:uid/disapprove', relate('disapprove'))

  profile.post('/:uid/favorite', async (c) => {
    const { viewer, target } = await loadParticipants(c)
    await c.var.db.transaction().execute(async (trx) => {
      const existing = await trx
        .selectFrom('favorites')
        .select(['id'])
        .where('userUid', '=', viewer.uid)
        .where('friendUid', '=', target.uid)
        .executeTakeFirst()
      if (existing == null) {
        await trx
          .insertInto('favorites')
          .values({ userId: viewer.id, userUid: viewer.uid, friendId: target.id, friendUid: target.uid })
          .execute()
      } else {
        await trx.deleteFrom('favorites').where('id', '=', existing.id).execute()
      }
    })
    c.var.logger.info({ uid: viewer.uid, friendUid: target.uid }, 'Profile favorite toggled')
    return actionResponse(c, viewer.uid, target.uid)
  })
}
