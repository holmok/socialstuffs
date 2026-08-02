import Layout from '../layouts/main-layout'

interface AccountValidationSuccessPageProps {
  description: string
}

const AccountValidationSuccessPage = ({ description }: AccountValidationSuccessPageProps) => {
  return (
    <Layout title="Account Validation Success" description={description}>
      <h1>Your account has been validated successfully.</h1>
      <p>
        Great! Welcome!! You can now <a href="/sign-in">sign in</a>. Enjoy your experience on Social Stuffs!
      </p>
    </Layout>
  )
}

export default AccountValidationSuccessPage
