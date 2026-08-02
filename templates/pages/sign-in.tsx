import SignInForm from '@templates/components/sign-in-form'
import Layout from '../layouts/main-layout'

interface SignInPageProps {
  description: string
}

const SignInPage = ({ description }: SignInPageProps) => {
  return (
    <Layout title="Sign in" description={description} styles={['auth']}>
      <h1>Sign In</h1>
      <SignInForm />
    </Layout>
  )
}

export default SignInPage
