import TextInput from './text-input'

type SignInFormProps = {
  email?: string
  password?: string
  errors?: Record<string, string[]>
}

const SignInForm = (props: SignInFormProps) => {
  return (
    <form
      className="form"
      action="/sign-in"
      method="post"
      hx-post="/sign-in"
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

      <TextInput
        id="password"
        name="password"
        label="Password"
        type="password"
        errors={props.errors?.password}
        placeholder="Enter a strong password..."
        autocomplete="current-password"
        required
      />

      <button type="submit">Sign In</button>
      <span className="form-indicator" aria-hidden="true">
        Working…
      </span>
      <p className="form-alt">
        Don't have an account? <a href="/sign-up">Sign up</a> for a FREE account.
        <br />
        Forgot your password? <a href="/recover-password">Recover</a> your password.
      </p>
    </form>
  )
}
export default SignInForm
