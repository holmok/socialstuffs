import Layout from '../layouts/main-layout'

interface AccountValidationFailurePageProps {
  description: string
  message?: string
}

const AccountValidationFailurePage = ({ description, message }: AccountValidationFailurePageProps) => {
  return (
    <Layout title="Account Validation Failure" description={description}>
      <h1>Invalid account validation link.</h1>
      {message && <p>{message}</p>}
    </Layout>
  )
}

export default AccountValidationFailurePage
