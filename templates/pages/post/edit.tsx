import PostForm, { type PostFormProps } from '@components/post/post-form'

type EditPostPageProps = { uid: string; returnTo?: string } & Omit<PostFormProps, 'action' | 'submitLabel'>

const EditPostPage = ({ uid, returnTo, ...form }: EditPostPageProps) => {
  // the validated origin page rides the action query strings so save and delete can return there
  const returnQuery = returnTo ? `?return=${encodeURIComponent(returnTo)}` : ''
  return (
    <div>
      <h1 className="form-heading">Edit Post</h1>
      <PostForm {...form} action={`/posts/${uid}/edit${returnQuery}`} submitLabel="Save Post" showDelete />
      {/* outside the form so HTMX error re-renders (which swap the form) never duplicate it */}
      <dialog id="post-delete-modal" className="delete-modal" aria-labelledby="post-delete-title">
        <h3 id="post-delete-title">Delete this post?</h3>
        <p>This will remove the post from your profile. It cannot be undone.</p>
        <div className="modal-actions">
          <button type="button" data-modal-close="">
            Cancel
          </button>
          <form method="post" action={`/posts/${uid}/delete${returnQuery}`}>
            <button type="submit" className="danger-button">
              Delete Post
            </button>
          </form>
        </div>
      </dialog>
    </div>
  )
}

export default EditPostPage
