import RecoverPasswordForm from '@templates/components/recover-password-form'

const RecoverPasswordPage = () => {
  return (
    <>
      <h1>Recover Password</h1>
      <p>Enter your email and, if it matches an account, we'll send a password reset link.</p>
      <RecoverPasswordForm />
    </>
  )
}

export default RecoverPasswordPage
