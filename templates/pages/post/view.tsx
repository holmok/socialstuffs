import CommentForm from '@components/post/comment-form'
import { formatDistanceToNow } from 'date-fns'

export type PostViewAuthor = {
  uid: string
  name: string
  imageUrl: string
}

export type PostView = {
  uid: string
  content: string
  imageUrl: string | null
  linkUrl: string | null
  linkText: string | null
  created: Date
  updated: Date
  author: PostViewAuthor
}

export type PostComment = {
  uid: string
  content: string
  created: Date
  author: PostViewAuthor
}

type PostViewPageProps = {
  post: PostView
  comments: PostComment[]
  commentLimitReached: boolean
}

// insert stamps created and updated with the same value in one statement; only an edit moves updated
const isEdited = (post: PostView) => post.updated.getTime() > post.created.getTime()

const PostViewPage = ({ post, comments, commentLimitReached }: PostViewPageProps) => {
  return (
    <div class="post-page">
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
              <img class="profile-post-image" src={post.imageUrl} alt="" loading="lazy" />
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
          </p>
        </div>
      </article>
      <section class="post-comments" aria-label="Comments">
        <h2>Comments</h2>
        {comments.length === 0 ? (
          <p class="profile-empty">No comments yet.</p>
        ) : (
          <ol class="comment-list">
            {comments.map((comment) => (
              <li class="comment" key={comment.uid}>
                <a
                  class="comment-author"
                  href={`/profile/${comment.author.uid}`}
                  title={comment.author.name}
                  aria-label={`View the profile of ${comment.author.name}`}
                >
                  <img class="comment-author-avatar" src={comment.author.imageUrl} alt="" loading="lazy" />
                </a>
                <div class="comment-body">
                  <p class="comment-content">{comment.content}</p>
                  <p class="comment-meta">
                    <a href={`/profile/${comment.author.uid}`}>{comment.author.name}</a>{' '}
                    {formatDistanceToNow(comment.created, { addSuffix: true })}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
        {commentLimitReached ? (
          <p class="comment-limit">This post has reached its comment limit.</p>
        ) : (
          <CommentForm postUid={post.uid} />
        )}
      </section>
    </div>
  )
}

export default PostViewPage
