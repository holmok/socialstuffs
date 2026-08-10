import { formatDistanceToNow } from 'date-fns'
import { postPhotoAlt } from '@/utils'

export type FeedPost = {
  uid: string
  content: string
  imageUrl: string | null
  linkUrl: string | null
  linkText: string | null
  created: Date
  updated: Date
  commentCount: number
  author: {
    uid: string
    name: string
    imageUrl: string
  }
}

const commentLabel = (count: number) => (count === 1 ? '1 comment' : `${count} comments`)

// insert stamps created and updated with the same value in one statement; only an edit moves updated
const isEdited = (post: FeedPost) => post.updated.getTime() > post.created.getTime()

// the avatar + body post card shared by the home feed and the discover page
const FeedPostCard = ({ post }: { post: FeedPost }) => {
  return (
    <article class="profile-post feed-post">
      <a
        class="feed-author"
        href={`/profile/${post.author.uid}`}
        title={post.author.name}
        aria-label={`View the profile of ${post.author.name}`}
      >
        <img class="feed-author-avatar" src={post.author.imageUrl} alt="" loading="lazy" />
      </a>
      <div class="feed-post-body">
        {post.imageUrl && (
          <a
            class="profile-post-image-link"
            href={post.imageUrl}
            data-lightbox=""
            aria-label="View photo full size"
            aria-haspopup="dialog"
          >
            <img class="profile-post-image" src={post.imageUrl} alt={postPhotoAlt(post.author.name)} loading="lazy" />
          </a>
        )}
        <p class="profile-post-content">{post.content}</p>
        {post.linkUrl && (
          <p class="profile-post-link">
            <a href={post.linkUrl} target="_blank" rel="noopener noreferrer">
              {post.linkText || post.linkUrl}
            </a>
          </p>
        )}
        <p class="profile-post-date">
          Posted by <a href={`/profile/${post.author.uid}`}>{post.author.name}</a>{' '}
          {formatDistanceToNow(post.created, { addSuffix: true })}
          {isEdited(post) && ' (edited)'}
          {' · '}
          <a href={`/posts/${post.uid}`}>{commentLabel(post.commentCount)}</a>
        </p>
      </div>
    </article>
  )
}

export default FeedPostCard
