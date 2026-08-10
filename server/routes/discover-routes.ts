import type { FeedPost } from '@components/post/feed-post-card'
import DiscoverPage from '@pages/discover'
import type { Hono } from 'hono'
import type { Logger } from 'pino'
import * as m from '@/middleware'
import * as utils from '@/utils'

export default function DiscoverRoutes(app: Hono, logger: Logger) {
  logger.info('Registering discover routes')
  const discover = app.basePath('/discover')
  discover.use('*', m.authorize({ requireAuth: true }))

  // every latest published post whose audience is everyone, regardless of the viewer's circle —
  // the discovery surface for finding people to favorite/approve
  discover.get('/', async (c) => {
    const { db, config } = c.var

    // ?p=<page> drives the posts offset; anything unparseable or below 1 lands on page 1
    const page = Math.max(1, Number.parseInt(c.req.query('p') ?? '', 10) || 1)

    // one extra row decides hasOlder — same pattern as the home feed
    const rows = await db
      .selectFrom('posts')
      .innerJoin('users', 'users.uid', 'posts.userUid')
      .leftJoin('postTargets', 'postTargets.postId', 'posts.id')
      .where('posts.status', '=', 'published')
      .where('users.status', '=', 'active')
      // audience 'all' only; posts predating audience rows count as 'all' (mirrors utils.audienceAllows)
      .where((eb) => eb.or([eb('postTargets.type', '=', 'all'), eb('postTargets.type', 'is', null)]))
      .select([
        'posts.uid as uid',
        'posts.content as content',
        'posts.imageUrl as imageUrl',
        'posts.linkUrl as linkUrl',
        'posts.linkText as linkText',
        'posts.created as created',
        'posts.updated as updated',
        'users.uid as authorUid',
        'users.username as authorUsername',
        'users.info as authorInfo'
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
      .limit(utils.POSTS_PER_PAGE + 1)
      .offset((page - 1) * utils.POSTS_PER_PAGE)
      .execute()
    const hasOlder = rows.length > utils.POSTS_PER_PAGE

    const posts: FeedPost[] = rows.slice(0, utils.POSTS_PER_PAGE).map((row) => {
      const info = row.authorInfo
      return {
        uid: row.uid,
        content: row.content,
        imageUrl: row.imageUrl,
        linkUrl: row.linkUrl,
        linkText: row.linkText,
        created: row.created,
        updated: row.updated,
        commentCount: Number(row.commentCount ?? 0),
        author: {
          uid: row.authorUid,
          name: info.fullname ?? row.authorUsername,
          imageUrl: utils.displayImageUrl(info, config.baseImageUrl)
        }
      }
    })

    return c.render(
      DiscoverPage({
        posts,
        page,
        hasNewer: page > 1,
        hasOlder
      }),
      {
        title: 'Discover',
        description: 'The latest public posts from everyone on socialstuffs.',
        styles: ['profile', 'home']
      }
    )
  })
}
