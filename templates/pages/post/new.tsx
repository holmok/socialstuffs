import PostForm, { createStatusOptions } from '@components/post/post-form'

const NewPostPage = () => {
  return (
    <div>
      <h1>New Post</h1>
      <PostForm action="/posts/new" submitLabel="Create Post" statusOptions={createStatusOptions} />
    </div>
  )
}

export default NewPostPage
