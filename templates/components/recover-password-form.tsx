import TextInput from './text-input'

type RecoverPasswordFormProps = {
  email?: string
  errors?: Record<string, string[]>
}

const RecoverPasswordForm = (props: RecoverPasswordFormProps) => {
  return (
    <form
      className="form"
      action="/recover-password"
      method="post"
      hx-post="/recover-password"
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
      <button type="submit">Send Reset Link</button>
      <span className="form-indicator" aria-hidden="true">
        Working…
      </span>
      <p className="form-alt">
        Remembered it? <a href="/sign-in">Sign In</a>
      </p>
    </form>
  )
}

export default RecoverPasswordForm
