import SignUpForm, { type SignUpFormProps } from '@templates/components/sign-up-form'

// form props flow through so no-JS error re-renders of the full page keep the typed values
const SignUpPage = (props: SignUpFormProps = {}) => {
  return (
    <>
      <h1 className="form-heading">Sign Up</h1>
      <p className="form-note form-intro">
        Currently we are in a private beta and sign-ups are by invitation only. An <strong>invitation code</strong> is required to
        create an account. If you do not have an <strong>invitation code</strong>, you can{' '}
        <a href="/waitlist">join the waitlist</a>.
      </p>
      <SignUpForm {...props} />
    </>
  )
}

export default SignUpPage
