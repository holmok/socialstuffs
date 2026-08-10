import PostForm, { createStatusOptions, type PostFormProps } from '@components/post/post-form'

// form props flow through so no-JS error re-renders of the full page keep the typed values
type NewPostPageProps = Omit<PostFormProps, 'action' | 'submitLabel' | 'statusOptions'>

const NewPostPage = (form: NewPostPageProps = {}) => {
  return (
    <div>
      <h1>New Post</h1>
      <PostForm {...form} action="/posts/new" submitLabel="Create Post" statusOptions={createStatusOptions} />
    </div>
  )
}

export default NewPostPage
