export type CommentFormProps = {
  postUid: string
  content?: string
  errors?: Record<string, string[]>
}

const CommentForm = (props: CommentFormProps) => {
  const action = `/posts/${props.postUid}/comments`
  const contentErrors = props.errors?.content
  return (
    <form
      className="form comment-form"
      action={action}
      method="post"
      hx-post={action}
      hx-target="this"
      hx-swap="outerHTML"
      hx-disabled-elt="find button"
      hx-indicator="find .form-indicator"
    >
      {props.errors?.form && (
        <div className="form-errors" role="alert">
          {props.errors.form.map((error, index) => (
            <p key={`form-error-${index}`}>{error}</p>
          ))}
        </div>
      )}
      <div className="text-input">
        <label htmlFor="comment-content" className={contentErrors?.length ? 'error' : undefined}>
          Add a comment
        </label>
        <textarea
          id="comment-content"
          name="content"
          rows={3}
          required
          placeholder="Write your comment..."
          data-charcount="comment-content-char-count"
          data-charmax="200"
          aria-invalid={contentErrors?.length ? 'true' : undefined}
          aria-describedby={contentErrors?.length ? 'comment-content-errors' : undefined}
          className={contentErrors?.length ? 'error' : undefined}
        >
          {props.content}
        </textarea>
        <p id="comment-content-char-count" className="char-count">
          {(props.content ?? '').length}/200 characters
        </p>
        {contentErrors && contentErrors.length > 0 && (
          <ul id="comment-content-errors" className="errors">
            {contentErrors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        )}
      </div>
      <button type="submit">Add Comment</button>
      <span className="form-indicator" aria-hidden="true">
        Working…
      </span>
    </form>
  )
}

export default CommentForm
