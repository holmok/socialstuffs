import ProfileActions, { type ProfileActionsProps } from '@components/profile/actions'
import type { PostStatus } from '@data/post-data'
import type { UserProfileInfo } from '@data/user-data'
import { formatDistanceToNow } from 'date-fns'

export type ProfileFavorite = {
  uid: string
  name: string
  imageUrl: string
}

export type ProfilePost = {
  uid: string
  content: string
  imageUrl: string | null
  linkUrl: string | null
  linkText: string | null
  status: PostStatus
  created: Date
  updated: Date
}

type ProfileUserPageProps = {
  username: string
  created?: Date
  info: UserProfileInfo
  favorites: ProfileFavorite[]
  posts: ProfilePost[]
  page: number
  hasNewer: boolean
  hasOlder: boolean
  actions: ProfileActionsProps
}

// insert stamps created and updated with the same value in one statement; only an edit moves updated
const isEdited = (post: ProfilePost) => post.updated.getTime() > post.created.getTime()

const ProfileUserPage = ({
  username,
  created,
  info,
  favorites,
  posts,
  page,
  hasNewer,
  hasOlder,
  actions
}: ProfileUserPageProps) => {
  const meta = [info.title, info.location].filter(Boolean).join(' · ')
  const memberSince = created?.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  return (
    <div className="profile-page">
      <aside className="profile-card profile-side">
        <img className="profile-avatar" src={info.profileImageUrl} alt={`Avatar for ${username}`} />
        <h1 className="profile-name">{info.fullname || username}</h1>
        <p className="profile-username">@{username}</p>
        {meta && <p className="profile-meta">{meta}</p>}
        {info.bio && <p className="profile-bio">{info.bio}</p>}
        {memberSince && <p className="profile-since">Member since {memberSince}</p>}
        <ProfileActions {...actions} />
      </aside>
      <div className="profile-main">
        <section className="profile-section">
          <h2>Favorites</h2>
          {favorites.length === 0 ? (
            <p className="profile-empty">No favorites yet.</p>
          ) : (
            <ul className="profile-favorites">
              {favorites.map((favorite) => (
                <li key={favorite.uid}>
                  <a href={`/profile/${favorite.uid}`} title={favorite.name} aria-label={`View the profile of ${favorite.name}`}>
                    <img className="profile-favorite-avatar" src={favorite.imageUrl} alt="" loading="lazy" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="profile-section">
          <div className="profile-section-header">
            <h2>Latest Posts</h2>
            {actions.isSelf && (
              <a className="profile-new-post-link" href="/posts/new">
                New Post
              </a>
            )}
          </div>
          {posts.length === 0 ? (
            <p className="profile-empty">No posts yet.</p>
          ) : (
            posts.map((post) => (
              <article className="profile-post" key={post.uid}>
                {post.imageUrl && (
                  <a className="profile-post-image-link" href={post.imageUrl} data-lightbox="">
                    <img className="profile-post-image" src={post.imageUrl} alt="" loading="lazy" />
                  </a>
                )}
                <p className="profile-post-content">{post.content}</p>
                {post.linkUrl && (
                  <p className="profile-post-link">
                    <a href={post.linkUrl} target="_blank" rel="noopener noreferrer">
                      {post.linkText || post.linkUrl}
                    </a>
                  </p>
                )}
                <div className="profile-post-footer">
                  <p className="profile-post-date">
                    {formatDistanceToNow(post.created, { addSuffix: true })}
                    {isEdited(post) && ' (edited)'}
                    {actions.isSelf && ` · ${post.status}`}
                  </p>
                  {actions.isSelf && (
                    <a className="profile-post-edit" href={`/posts/${post.uid}/edit`}>
                      Edit
                    </a>
                  )}
                </div>
              </article>
            ))
          )}
          {(hasNewer || hasOlder) && (
            <nav className="profile-pagination" aria-label="Posts pages">
              {hasNewer && <a href={`/profile/${actions.profileUid}?p=${page - 1}`}>« Newer</a>}
              {hasOlder && <a href={`/profile/${actions.profileUid}?p=${page + 1}`}>Older »</a>}
            </nav>
          )}
        </section>
      </div>
    </div>
  )
}

export default ProfileUserPage
