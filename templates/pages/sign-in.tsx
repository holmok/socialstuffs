import SignInForm from '@templates/components/sign-in-form'

type SignInPageProps = {
  next?: string
}

const SignInPage = (props: SignInPageProps = {}) => {
  return (
    <>
      <h1>Sign In</h1>
      <SignInForm next={props.next} />
    </>
  )
}

export default SignInPage
