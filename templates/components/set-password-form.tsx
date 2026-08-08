import TextInput from './text-input'

type SetPasswordFormProps = {
  token: string
  uid: string
  errors?: Record<string, string[]>
}

const SetPasswordForm = (props: SetPasswordFormProps) => {
  return (
    <form className="form" hx-post={`/recover-password/${props.token}/${props.uid}`} hx-target="this" hx-swap="outerHTML">
      {props.errors?.form && (
        <div className="form-errors">
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
        required
      />
      <TextInput
        id="confirmPassword"
        name="confirmPassword"
        label="Confirm Password"
        type="password"
        errors={props.errors?.confirmPassword}
        placeholder="Confirm your password..."
        required
      />
      <button type="submit">Reset Password</button>
    </form>
  )
}

export default SetPasswordForm
