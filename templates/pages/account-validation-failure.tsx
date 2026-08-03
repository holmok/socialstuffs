interface AccountValidationFailurePageProps {
  message?: string
}

const AccountValidationFailurePage = ({ message }: AccountValidationFailurePageProps) => {
  return (
    <>
      <h1>Invalid account validation link.</h1>
      {message && <p>{message}</p>}
    </>
  )
}

export default AccountValidationFailurePage
