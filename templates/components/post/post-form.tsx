import TextInput from '@components/text-input'
import type { PostStatus } from '@data/post-data'
import type { PostTargetType } from '@data/post-target-data'

export type StatusOption = { value: PostStatus; label: string }

export const createStatusOptions: StatusOption[] = [
  { value: 'published', label: 'Publish now' },
  { value: 'draft', label: 'Save as draft' }
]

// editing offers published/archived (deletion has its own confirmed control); a post still in
// draft also keeps Draft so opening the form does not force it out of draft
export function editStatusOptions(current: PostStatus): StatusOption[] {
  const options: StatusOption[] = [
    { value: 'published', label: 'Published' },
    { value: 'archived', label: 'Archived' }
  ]
  return current === 'draft' ? [{ value: 'draft', label: 'Draft' }, ...options] : options
}

export type PostFormProps = {
  action: string
  submitLabel: string
  statusOptions: StatusOption[]
  // renders the Delete Post trigger under the submit button; the confirm dialog itself
  // lives on the page outside this form (see the edit post page)
  showDelete?: boolean
  // an already-stored post photo; shown in the preview and kept unless a new file is picked
  imageUrl?: string
  content?: string
  linkUrl?: string
  linkText?: string
  status?: string
  audience?: string
  errors?: Record<string, string[]>
}

const audienceOptions: { value: PostTargetType; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'non_disapproved', label: 'Everyone except people you disapproved' },
  { value: 'approved', label: 'Only people you approved' },
  { value: 'favorites', label: 'Only your favorites' }
]

const SelectErrors = ({ id, errors }: { id: string; errors?: string[] }) => {
  if (!errors || errors.length === 0) return null
  return (
    <ul id={id} className="errors">
      {errors.map((error, index) => (
        <li key={index}>{error}</li>
      ))}
    </ul>
  )
}

const PostForm = (props: PostFormProps) => {
  const { action, submitLabel, imageUrl } = props
  const contentErrors = props.errors?.content
  const imageErrors = props.errors?.image
  return (
    <form
      className="form"
      action={action}
      method="post"
      enctype="multipart/form-data"
      hx-post={action}
      hx-encoding="multipart/form-data"
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
        <label htmlFor="content" className={contentErrors?.length ? 'error' : undefined}>
          What do you want to say?
        </label>
        <textarea
          id="content"
          name="content"
          rows={6}
          required
          placeholder="Write your post..."
          data-charcount="content-char-count"
          data-charmax="500"
          aria-invalid={contentErrors?.length ? 'true' : undefined}
          aria-describedby={contentErrors?.length ? 'content-errors' : undefined}
          className={contentErrors?.length ? 'error' : undefined}
        >
          {props.content}
        </textarea>
        <p id="content-char-count" className="char-count">
          {(props.content ?? '').length}/500 characters
        </p>
        {contentErrors && contentErrors.length > 0 && (
          <ul id="content-errors" className="errors">
            {contentErrors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="text-input">
        <img
          id="post-image-preview"
          className="post-image-preview"
          src={imageUrl ?? ''}
          alt="Preview of your selection"
          hidden={imageUrl == null}
        />
        <input
          id="image"
          name="image"
          type="file"
          accept="image/jpeg,image/png,image/gif"
          className="file-input"
          data-preview="post-image-preview"
          data-filename="image-file-name"
          aria-invalid={imageErrors?.length ? 'true' : undefined}
          aria-describedby={imageErrors?.length ? 'image-errors' : undefined}
        />
        <label htmlFor="image" className="file-button">
          {imageUrl ? 'Change Photo' : 'Add a Photo'}
        </label>
        <span id="image-file-name" className="file-name">
          No file selected
        </span>
        <p className="form-note">
          {imageUrl ? 'Leave empty to keep the current photo. ' : 'Optional. '}JPEG, PNG, or GIF up to 20MB.
        </p>
        {imageErrors && imageErrors.length > 0 && (
          <ul id="image-errors" className="errors">
            {imageErrors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        )}
      </div>
      <TextInput
        id="linkUrl"
        name="linkUrl"
        label="Link URL"
        value={props.linkUrl}
        errors={props.errors?.linkUrl}
        placeholder="https://example.com (optional)..."
      />
      <TextInput
        id="linkText"
        name="linkText"
        label="Link Text"
        value={props.linkText}
        errors={props.errors?.linkText}
        placeholder="What to show for the link (optional)..."
      />
      <div className="text-input">
        <label htmlFor="audience">Who can see this?</label>
        <select id="audience" name="audience">
          {audienceOptions.map((option) => (
            <option key={option.value} value={option.value} selected={(props.audience ?? 'all') === option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <SelectErrors id="audience-errors" errors={props.errors?.audience} />
      </div>
      <div className="text-input">
        <label htmlFor="status">Status</label>
        <select id="status" name="status">
          {props.statusOptions.map((option) => (
            <option key={option.value} value={option.value} selected={(props.status ?? 'published') === option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <SelectErrors id="status-errors" errors={props.errors?.status} />
      </div>
      <button type="submit">{submitLabel}</button>
      <span className="form-indicator" aria-hidden="true">
        Working…
      </span>
      {props.showDelete && (
        <button type="button" className="post-delete-link" data-modal-open="post-delete-modal">
          Delete Post
        </button>
      )}
    </form>
  )
}

export default PostForm
