import TextInput from './text-input'

export type WaitlistFormProps = {
  email?: string
  errors?: Record<string, string[]>
}

const WaitlistForm = (props: WaitlistFormProps) => {
  return (
    <form
      className="form"
      action="/waitlist"
      method="post"
      hx-post="/waitlist"
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
      <button type="submit">Join the Waitlist</button>
      <span className="form-indicator" aria-live="polite">
        Working…
      </span>
      <p className="form-alt">
        Already have an invite code? <a href="/sign-up">Sign Up</a>
      </p>
    </form>
  )
}

export default WaitlistForm
