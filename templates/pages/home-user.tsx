import FeedPostCard, { type FeedPost } from '@components/post/feed-post-card'

export type { FeedPost }

type HomeUserPageProps = {
  posts: FeedPost[]
  page: number
  hasNewer: boolean
  hasOlder: boolean
  // shown to users who have not favorited or approved anyone yet — their feed can only ever
  // hold their own posts, so point them at the discover page to build a circle
  showDiscoverCta: boolean
}

const HomeUserPage = ({ posts, page, hasNewer, hasOlder, showDiscoverCta }: HomeUserPageProps) => {
  return (
    <div class="home-user">
      <h1>Latest Posts from Your Circle</h1>
      {showDiscoverCta && (
        <p class="feed-cta">
          Your feed shows posts from people you favorite or approve. Head to <a href="/discover">Discover</a> to find people worth
          following.
        </p>
      )}
      {posts.length === 0 ? (
        <p class="profile-empty">
          Nothing here yet. Favorite or approve some people to fill your feed, or <a href="/posts/new">write your first post</a>.
        </p>
      ) : (
        posts.map((post) => <FeedPostCard post={post} key={post.uid} />)
      )}
      {(hasNewer || hasOlder) && (
        <nav class="profile-pagination" aria-label="Feed pages">
          {hasNewer && <a href={`/?p=${page - 1}`}>« Newer</a>}
          {hasOlder && <a href={`/?p=${page + 1}`}>Older »</a>}
        </nav>
      )}
    </div>
  )
}

export default HomeUserPage
