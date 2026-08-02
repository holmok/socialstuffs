import SignUpForm from '@templates/components/signup-form'
import Layout from '../layouts/main-layout'

interface SignUpPageProps {
  description: string
}

const SignUpPage = ({ description }: SignUpPageProps) => {
  return (
    <Layout title="Sign Up" description={description} styles={['auth']}>
      <h1>Sign Up</h1>
      <SignUpForm />
    </Layout>
  )
}

export default SignUpPage
