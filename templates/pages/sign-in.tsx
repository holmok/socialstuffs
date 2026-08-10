import SignInForm, { type SignInFormProps } from '@templates/components/sign-in-form'

// form props flow through so no-JS error re-renders of the full page keep the typed values
const SignInPage = (props: SignInFormProps = {}) => {
  return (
    <>
      <h1 className="form-heading">Sign In</h1>
      <SignInForm {...props} />
    </>
  )
}

export default SignInPage
