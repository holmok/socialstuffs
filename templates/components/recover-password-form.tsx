import TextInput from './text-input'

type RecoverPasswordFormProps = {
  email?: string
  errors?: Record<string, string[]>
}

const RecoverPasswordForm = (props: RecoverPasswordFormProps) => {
  return (
    <form className="form" hx-post="/recover-password" hx-target="this" hx-swap="outerHTML">
      {props.errors?.form && (
        <div className="form-errors">
          {props.errors.form.map((error, index) => (
            <p key={`form-error-${index}`}>{error}</p>
          ))}
        </div>
      )}
      <TextInput
        id="email"
        name="email"
        label="Email"
        type="email"
        value={props.email}
        errors={props.errors?.email}
        placeholder="Enter your email..."
        required
      />
      <button type="submit">Send Reset Link</button>
      <p className="form-alt">
        Remembered it? <a href="/sign-in">Sign In</a>
      </p>
    </form>
  )
}

export default RecoverPasswordForm
