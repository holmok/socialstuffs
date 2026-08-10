import type { UserProfileInfo } from '@data/user-data'
import { passwordVersion } from '@middleware/auth-middleware'
import AboutPage from '@pages/about'
import ContactPage from '@templates/pages/contact'
import HomeAnonPage from '@templates/pages/home-anon'
import HomeUserPage, { type FeedPost } from '@templates/pages/home-user'
import PrivacyPage from '@templates/pages/privacy'
import TermsPage from '@templates/pages/terms'
import type { Context, Hono } from 'hono'
import type { Logger } from 'pino'
import * as utils from '@/utils'

const POSTS_PER_PAGE = 5

// users without an uploaded photo get the shared placeholder image from the bucket (mirrors profile-routes)
function displayImageUrl(info: UserProfileInfo, baseImageUrl: string) {
  const base = baseImageUrl.endsWith('/') ? baseImageUrl : `${baseImageUrl}/`
  return info.profileImageUrl ?? new URL('profile.jpg', base).href
}

// published posts from the viewer themselves plus active authors in the viewer's circle (people the
// viewer favorited or approved), the latter narrowed to what each post's audience lets the viewer
// see (utils.audienceAllows); the viewer's own posts show regardless of audience
function feedQuery(c: Context, viewerUid: string) {
  return c.var.db
    .selectFrom('posts')
    .innerJoin('users', 'users.uid', 'posts.userUid')
    .leftJoin('postTargets', 'postTargets.postId', 'posts.id')
    .where('posts.status', '=', 'published')
    .where('users.status', '=', 'active')
    .where((eb) =>
      eb.or([
        eb('posts.userUid', '=', viewerUid),
        eb.and([
          eb.or([
            eb.exists(
              eb
                .selectFrom('favorites')
                .select('favorites.id')
                .where('favorites.userUid', '=', viewerUid)
                .whereRef('favorites.friendUid', '=', 'posts.userUid')
            ),
            eb.exists(
              eb
                .selectFrom('relations')
                .select('relations.id')
                .where('relations.userUid', '=', viewerUid)
                .where('relations.type', '=', 'approve')
                .whereRef('relations.friendUid', '=', 'posts.userUid')
            )
          ]),
          utils.audienceAllows(eb, viewerUid)
        ])
      ])
    )
}

export default function PublicRoutes(app: Hono, logger: Logger) {
  logger.info('Registering public routes')

  app.get('/', async (c) => {
    const { auth, config } = c.var

    // re-check the DB like authorize() does: JWT claims are a sign-in-time snapshot, and a banned/
    // deleted user (or one whose password changed) must lose the feed now, not at the 7-day exp
    let revoked = false
    if (auth.user != null) {
      const row = await auth.getUserRow()
      revoked = row == null || row.status !== 'active' || passwordVersion(row.passwordHash) !== auth.user.pwv
      if (revoked) await auth.signOut()
    }

    if (auth.user == null || revoked) {
      return c.render(HomeAnonPage(), {
        title: 'Home',
        description: 'A great place to hang out and share your thoughts.',
        styles: ['info']
      })
    }

    const viewerUid = auth.user.uid
    // ?p=<page> drives the posts offset; anything unparseable or below 1 lands on page 1
    const page = Math.max(1, Number.parseInt(c.req.query('p') ?? '', 10) || 1)

    // one extra row decides hasOlder — far cheaper than re-running the visibility predicate as a COUNT(*)
    const rows = await feedQuery(c, viewerUid)
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
      .limit(POSTS_PER_PAGE + 1)
      .offset((page - 1) * POSTS_PER_PAGE)
      .execute()
    const hasOlder = rows.length > POSTS_PER_PAGE

    const posts: FeedPost[] = rows.slice(0, POSTS_PER_PAGE).map((row) => {
      const info = row.authorInfo as UserProfileInfo
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
          imageUrl: displayImageUrl(info, config.baseImageUrl)
        }
      }
    })

    return c.render(
      HomeUserPage({
        posts,
        page,
        hasNewer: page > 1,
        hasOlder
      }),
      {
        title: 'Home',
        description: 'A great place to hang out and share your thoughts.',
        styles: ['profile', 'home']
      }
    )
  })

  app.get('/about', (c) => {
    return c.render(AboutPage(), { title: 'About', description: 'All about socialstuffs.', styles: ['info'] })
  })

  app.get('/contact', (c) => {
    return c.render(ContactPage(), { title: 'Contact Us', description: 'How to contact the team.', styles: ['info'] })
  })

  app.get('/terms', (c) => {
    return c.render(TermsPage(), { title: 'Terms of Service', description: 'Our terms of service.', styles: ['info'] })
  })

  app.get('/privacy', (c) => {
    return c.render(PrivacyPage(), { title: 'Privacy Policy', description: 'Our privacy policy.', styles: ['info'] })
  })
}
