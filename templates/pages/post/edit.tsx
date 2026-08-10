import PostForm, { type PostFormProps } from '@components/post/post-form'

type EditPostPageProps = { uid: string } & Omit<PostFormProps, 'action' | 'submitLabel'>

const EditPostPage = ({ uid, ...form }: EditPostPageProps) => {
  return (
    <div>
      <h1>Edit Post</h1>
      <PostForm {...form} action={`/posts/${uid}/edit`} submitLabel="Save Post" showDelete />
      {/* outside the form so HTMX error re-renders (which swap the form) never duplicate it */}
      <dialog id="post-delete-modal" className="delete-modal">
        <h3>Delete this post?</h3>
        <p>This will remove the post from your profile. It cannot be undone.</p>
        <div className="modal-actions">
          <button type="button" data-modal-close="">
            Cancel
          </button>
          <form method="post" action={`/posts/${uid}/delete`}>
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
