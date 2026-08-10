import SignUpForm, { type SignUpFormProps } from '@templates/components/sign-up-form'

// form props flow through so no-JS error re-renders of the full page keep the typed values
const SignUpPage = (props: SignUpFormProps = {}) => {
  return (
    <>
      <h1 className="form-heading">Sign Up</h1>
      <SignUpForm {...props} />
    </>
  )
}

export default SignUpPage
