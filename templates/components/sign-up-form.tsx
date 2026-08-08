import TextInput from './text-input'

type SignUpFormProps = {
  username?: string
  email?: string
  confirmEmail?: string
  password?: string
  confirmPassword?: string
  errors?: Record<string, string[]>
}

const SignUpForm = (props: SignUpFormProps) => {
  return (
    <form className="form" hx-post="/sign-up" hx-target="this" hx-swap="outerHTML">
      {props.errors?.form && (
        <div className="form-errors">
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
        required
      />
      <TextInput
        id="password"
        name="password"
        label="Password"
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
      <button type="submit">Sign Up</button>
      <p className="form-alt">
        Already signed up? <a href="/sign-in">Sign In</a>
      </p>
    </form>
  )
}

export default SignUpForm
