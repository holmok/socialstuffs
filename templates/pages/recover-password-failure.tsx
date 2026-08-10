interface RecoverPasswordFailurePageProps {
  message?: string
}

const RecoverPasswordFailurePage = ({ message }: RecoverPasswordFailurePageProps) => {
  return (
    <>
      <h1 className="form-heading">Invalid password reset link.</h1>
      {message && <p>{message}</p>}
      <p>
        Need a new link? <a href="/recover-password">Request a new password reset</a>.
      </p>
    </>
  )
}

export default RecoverPasswordFailurePage
