import TextInput from './text-input'

type SetPasswordFormProps = {
  token: string
  uid: string
  errors?: Record<string, string[]>
}

const SetPasswordForm = (props: SetPasswordFormProps) => {
  return (
    <form
      className="form"
      action={`/recover-password/${props.token}/${props.uid}`}
      method="post"
      hx-post={`/recover-password/${props.token}/${props.uid}`}
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
        id="password"
        name="password"
        label="New Password"
        type="password"
        errors={props.errors?.password}
        placeholder="Enter a strong password..."
        autocomplete="new-password"
        required
      />
      <TextInput
        id="confirmPassword"
        name="confirmPassword"
        label="Confirm Password"
        type="password"
        errors={props.errors?.confirmPassword}
        placeholder="Confirm your password..."
        autocomplete="new-password"
        required
      />
      <button type="submit">Reset Password</button>
      <span className="form-indicator" aria-hidden="true">
        Working…
      </span>
    </form>
  )
}

export default SetPasswordForm
