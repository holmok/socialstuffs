import TextInput from '@components/text-input'

export type UserSettingsFormProps = {
  username?: string
  email?: string
  errors?: Record<string, string[]>
}

const UserSettingsForm = (props: UserSettingsFormProps) => {
  return (
    <form
      className="form"
      action="/user/settings"
      method="post"
      hx-post="/user/settings"
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
      <TextInput
        id="username"
        name="username"
        label="Username"
        value={props.username}
        errors={props.errors?.username}
        placeholder="Enter a unique username..."
        autocomplete="username"
        required
      />
      <TextInput
        id="email"
        name="email"
        label="Email"
        type="email"
        value={props.email}
        errors={props.errors?.email}
        placeholder="Enter your email..."
        autocomplete="email"
        required
      />
      <p className="form-note">Changing your email signs you out until you verify the new address (we'll email you a link).</p>
      <TextInput
        id="currentPassword"
        name="currentPassword"
        label="Current Password"
        type="password"
        errors={props.errors?.currentPassword}
        placeholder="Enter your current password..."
        autocomplete="current-password"
      />
      <p className="form-note">Required to change your email or password.</p>
      <TextInput
        id="password"
        name="password"
        label="New Password"
        type="password"
        errors={props.errors?.password}
        placeholder="Leave blank to keep your current password..."
        autocomplete="new-password"
      />
      <TextInput
        id="confirmPassword"
        name="confirmPassword"
        label="Confirm New Password"
        type="password"
        errors={props.errors?.confirmPassword}
        placeholder="Confirm your new password..."
        autocomplete="new-password"
      />
      <button type="submit">Save Changes</button>
      <span className="form-indicator" aria-live="polite">
        Working…
      </span>
    </form>
  )
}

export default UserSettingsForm
