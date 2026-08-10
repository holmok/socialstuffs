import TextInput from '@components/text-input'
import type { UserProfileInfo } from '@data/user-data'

export type EditProfileFormProps = UserProfileInfo & {
  errors?: Record<string, string[]>
  // shown on error re-renders when the failed submit included a photo the browser can't restore
  imageDroppedNote?: boolean
}

const EditProfileForm = (props: EditProfileFormProps) => {
  const imageErrors = props.errors?.image
  const bioErrors = props.errors?.bio
  return (
    <form
      className="form"
      action="/user/edit-profile"
      method="post"
      enctype="multipart/form-data"
      hx-post="/user/edit-profile"
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
      <div className="text-input image-input">
        <img id="profile-image-preview" className="image-preview" src={props.profileImageUrl} alt="Profile preview" />
        <input
          id="image"
          name="image"
          type="file"
          accept="image/jpeg,image/png,image/gif"
          className="file-input"
          data-preview="profile-image-preview"
          data-filename="image-file-name"
          aria-invalid={imageErrors?.length ? 'true' : undefined}
          aria-describedby={imageErrors?.length ? 'image-errors' : undefined}
        />
        <label htmlFor="image" className="file-button">
          Upload Profile Photo
        </label>
        <span id="image-file-name" className="file-name">
          No file selected
        </span>
        <p className="form-note">JPEG, PNG, or GIF up to 20MB (animated GIFs become a still image).</p>
        {props.imageDroppedNote && <p className="form-note">Your photo needs to be re-selected.</p>}
        {imageErrors && imageErrors.length > 0 && (
          <ul id="image-errors" className="errors">
            {imageErrors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        )}
      </div>
      <TextInput
        id="fullname"
        name="fullname"
        label="Full Name"
        value={props.fullname}
        errors={props.errors?.fullname}
        placeholder="Enter your full name..."
        autocomplete="name"
      />
      <TextInput
        id="title"
        name="title"
        label="Title"
        value={props.title}
        errors={props.errors?.title}
        placeholder="What do you do..."
      />
      <TextInput
        id="location"
        name="location"
        label="Location"
        value={props.location}
        errors={props.errors?.location}
        placeholder="Where are you..."
      />
      <div className="text-input">
        <label htmlFor="bio" className={bioErrors?.length ? 'error' : undefined}>
          Bio
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={6}
          placeholder="Tell people a little about yourself..."
          data-charcount="bio-char-count"
          data-charmax="500"
          aria-invalid={bioErrors?.length ? 'true' : undefined}
          aria-describedby={bioErrors?.length ? 'bio-errors bio-char-count' : 'bio-char-count'}
          className={bioErrors?.length ? 'error' : undefined}
        >
          {props.bio}
        </textarea>
        <p id="bio-char-count" className="char-count" aria-live="polite">
          {(props.bio ?? '').length}/500 characters
        </p>
        {bioErrors && bioErrors.length > 0 && (
          <ul id="bio-errors" className="errors">
            {bioErrors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        )}
      </div>
      <button type="submit">Save Profile</button>
      <span className="form-indicator" aria-live="polite">
        Working…
      </span>
    </form>
  )
}

export default EditProfileForm
