import FeedPostCard, { type FeedPost } from '@components/post/feed-post-card'

type DiscoverPageProps = {
  posts: FeedPost[]
  page: number
  hasNewer: boolean
  hasOlder: boolean
}

const DiscoverPage = ({ posts, page, hasNewer, hasOlder }: DiscoverPageProps) => {
  return (
    <div class="home-user discover">
      <h1>Discover</h1>
      <p class="discover-note">The latest public posts from everyone on socialstuffs — find people worth following.</p>
      {posts.length === 0 ? (
        <p class="profile-empty">No public posts yet.</p>
      ) : (
        posts.map((post) => <FeedPostCard post={post} key={post.uid} />)
      )}
      {(hasNewer || hasOlder) && (
        <nav class="profile-pagination" aria-label="Discover pages">
          {hasNewer && <a href={`/discover?p=${page - 1}`}>« Newer</a>}
          {hasOlder && <a href={`/discover?p=${page + 1}`}>Older »</a>}
        </nav>
      )}
    </div>
  )
}

export default DiscoverPage
