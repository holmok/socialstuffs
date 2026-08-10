interface AccountValidationFailurePageProps {
  message?: string
}

const AccountValidationFailurePage = ({ message }: AccountValidationFailurePageProps) => {
  return (
    <>
      <h1 className="form-heading">Invalid account validation link.</h1>
      {message && <p>{message}</p>}
      <p>
        Need a new link? <a href="/resend-validation">Resend your validation email</a>.
      </p>
    </>
  )
}

export default AccountValidationFailurePage
