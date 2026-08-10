import ProfileActions from '@components/profile/actions'
import type { RelationType } from '@data/relation-data'
import ProfileUserPage, { type ProfileFavorite } from '@pages/profile/user'
import type { Context, Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { Logger } from 'pino'
import * as m from '@/middleware'
import * as utils from '@/utils'

// the profile favorites strip is a fixed-size teaser, not a full list — cap what one page load pulls in
const FAVORITES_STRIP_LIMIT = 20

// caps on outgoing relationships keep each user's graph (and the audience/feed subqueries that
// walk it) bounded; clearing an existing favorite/relation is never blocked, only adding
const MAX_FAVORITES = 10
const RELATION_CAPS: Record<RelationType, number> = { approve: 50, disapprove: 50 }

// posts visible on a profile: the owner sees all their non-deleted posts; anyone else sees only
// published posts whose audience includes them (utils.audienceAllows)
function profilePostsQuery(c: Context, profileUid: string, viewerUid: string) {
  const query = c.var.db
    .selectFrom('posts')
    .leftJoin('postTargets', 'postTargets.postId', 'posts.id')
    .where('posts.userUid', '=', profileUid)
  if (viewerUid === profileUid) return query.where('posts.status', '!=', 'deleted')
  return query.where('posts.status', '=', 'published').where((eb) => utils.audienceAllows(eb, viewerUid))
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

    const info = { ...user.info }
    info.profileImageUrl = utils.displayImageUrl(info, config.baseImageUrl)

    // ?p=<page> drives the posts offset; anything unparseable or below 1 lands on page 1
    const page = Math.max(1, Number.parseInt(c.req.query('p') ?? '', 10) || 1)

    const [state, favoriteRows, posts] = await Promise.all([
      actionState(c, viewerUid, uid),
      db
        .selectFrom('favorites')
        .innerJoin('users', 'users.uid', 'favorites.friendUid')
        .select(['users.uid as uid', 'users.username as username', 'users.info as info'])
        .where('favorites.userUid', '=', uid)
        .where('users.status', '=', 'active')
        .orderBy('favorites.created', 'desc')
        // one extra row decides hasMoreFavorites — the strip renders at most FAVORITES_STRIP_LIMIT avatars
        .limit(FAVORITES_STRIP_LIMIT + 1)
        .execute(),
      profilePostsQuery(c, uid, viewerUid)
        .select([
          'posts.uid as uid',
          'posts.content as content',
          'posts.imageUrl as imageUrl',
          'posts.linkUrl as linkUrl',
          'posts.linkText as linkText',
          'posts.status as status',
          'posts.created as created',
          'posts.updated as updated'
        ])
        .select((eb) =>
          eb
            .selectFrom('comments')
            .select((cb) => cb.fn.countAll<number>().as('total'))
            .whereRef('comments.postId', '=', 'posts.id')
            .as('commentCount')
        )
        // id breaks ties so posts created in the same instant keep a stable order across pages
        .orderBy('posts.created', 'desc')
        .orderBy('posts.id', 'desc')
        // one extra row decides hasOlder — cheaper than re-running the visibility predicate as a COUNT(*)
        .limit(utils.POSTS_PER_PAGE + 1)
        .offset((page - 1) * utils.POSTS_PER_PAGE)
        .execute()
    ])
    const hasOlder = posts.length > utils.POSTS_PER_PAGE
    const hasMoreFavorites = favoriteRows.length > FAVORITES_STRIP_LIMIT

    const favorites: ProfileFavorite[] = favoriteRows.slice(0, FAVORITES_STRIP_LIMIT).map((row) => ({
      uid: row.uid,
      name: row.info.fullname ?? row.username,
      imageUrl: utils.displayImageUrl(row.info, config.baseImageUrl)
    }))

    const name = info.fullname ?? user.username
    return c.render(
      ProfileUserPage({
        username: user.username,
        created: user.created,
        info,
        favorites,
        hasMoreFavorites,
        posts: posts.slice(0, utils.POSTS_PER_PAGE).map((post) => ({ ...post, commentCount: Number(post.commentCount ?? 0) })),
        page,
        hasNewer: page > 1,
        hasOlder,
        actions: { profileUid: uid, isSelf: viewerUid === uid, ...state }
      }),
      {
        title: `Profile: ${name}`,
        description: `User profile page for ${name}.`,
        styles: ['user', 'profile']
      }
    )
  })

  // mutually exclusive toggle: same type again clears it, the other type switches it, none sets it.
  // Adding or switching to a type is capped; clearing is always allowed so a full list can shrink.
  const relate = (type: RelationType) => async (c: Context) => {
    const { viewer, target } = await loadParticipants(c)
    await c.var.db.transaction().execute(async (trx) => {
      // serialize this user's relation writes so a double-submit can't sneak past the cap
      // (same FOR UPDATE-on-the-parent-row pattern as the comment cap)
      await trx.selectFrom('users').select('id').where('id', '=', viewer.id).forUpdate().execute()
      const existing = await trx
        .selectFrom('relations')
        .select(['id', 'type'])
        .where('userUid', '=', viewer.uid)
        .where('friendUid', '=', target.uid)
        .executeTakeFirst()
      // both the fresh insert and the approve<->disapprove switch grow the target type's count
      if (existing == null || existing.type !== type) {
        const max = RELATION_CAPS[type]
        const row = await trx
          .selectFrom('relations')
          .select((eb) => eb.fn.countAll<number>().as('total'))
          .where('userUid', '=', viewer.uid)
          .where('type', '=', type)
          .executeTakeFirst()
        if (Number(row?.total ?? 0) >= max) {
          throw new HTTPException(400, { message: `You can ${type} at most ${max} people. Remove one first.` })
        }
      }
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
      // serialize this user's favorite writes so a double-submit can't sneak past the cap
      await trx.selectFrom('users').select('id').where('id', '=', viewer.id).forUpdate().execute()
      const existing = await trx
        .selectFrom('favorites')
        .select(['id'])
        .where('userUid', '=', viewer.uid)
        .where('friendUid', '=', target.uid)
        .executeTakeFirst()
      if (existing == null) {
        const row = await trx
          .selectFrom('favorites')
          .select((eb) => eb.fn.countAll<number>().as('total'))
          .where('userUid', '=', viewer.uid)
          .executeTakeFirst()
        if (Number(row?.total ?? 0) >= MAX_FAVORITES) {
          throw new HTTPException(400, { message: `You can favorite at most ${MAX_FAVORITES} people. Remove one first.` })
        }
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
