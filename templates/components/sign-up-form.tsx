import TextInput from './text-input'

export type SignUpFormProps = {
  inviteCode?: string
  username?: string
  email?: string
  confirmEmail?: string
  password?: string
  confirmPassword?: string
  errors?: Record<string, string[]>
}

const SignUpForm = (props: SignUpFormProps) => {
  return (
    <form
      className="form"
      action="/sign-up"
      method="post"
      hx-post="/sign-up"
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
        id="inviteCode"
        name="inviteCode"
        label="Invite Code"
        value={props.inviteCode}
        errors={props.errors?.inviteCode}
        placeholder="Enter your invite code..."
        autocomplete="off"
        required
      />
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
      <TextInput
        id="confirmEmail"
        name="confirmEmail"
        label="Confirm Email"
        type="email"
        value={props.confirmEmail}
        errors={props.errors?.confirmEmail}
        placeholder="Confirm your email..."
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
      <p className="form-note">
        Passwords need at least 10 characters with an uppercase letter, a lowercase letter, a number, and a special character — no
        spaces.
      </p>
      <button type="submit">Sign Up</button>
      <span className="form-indicator" aria-live="polite">
        Working…
      </span>
      <p className="form-alt">
        Already signed up? <a href="/sign-in">Sign In</a>
      </p>
      <p className="form-alt">
        No invite code? <a href="/waitlist">Join the waitlist</a>
      </p>
    </form>
  )
}

export default SignUpForm
