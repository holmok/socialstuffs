import SetPasswordForm, { type SetPasswordFormProps } from '@templates/components/set-password-form'

// form props (token/uid/errors) flow through so no-JS error re-renders of the full page keep the errors
const RecoverPasswordSetPage = (props: SetPasswordFormProps) => {
  return (
    <>
      <h1 className="form-heading">Set a New Password</h1>
      <p>Choose a new password for your account.</p>
      <SetPasswordForm {...props} />
    </>
  )
}

export default RecoverPasswordSetPage
