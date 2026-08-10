import RecoverPasswordForm, { type RecoverPasswordFormProps } from '@templates/components/recover-password-form'

// form props flow through so no-JS error re-renders of the full page keep the typed values
const RecoverPasswordPage = (props: RecoverPasswordFormProps = {}) => {
  return (
    <>
      <h1 className="form-heading">Recover Password</h1>
      <p>Enter your email and, if it matches an account, we'll send a password reset link.</p>
      <RecoverPasswordForm {...props} />
    </>
  )
}

export default RecoverPasswordPage
