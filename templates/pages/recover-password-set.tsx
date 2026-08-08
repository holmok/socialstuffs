import SetPasswordForm from '@templates/components/set-password-form'

interface RecoverPasswordSetPageProps {
  token: string
  uid: string
}

const RecoverPasswordSetPage = ({ token, uid }: RecoverPasswordSetPageProps) => {
  return (
    <>
      <h1>Set a New Password</h1>
      <p>Choose a new password for your account.</p>
      <SetPasswordForm token={token} uid={uid} />
    </>
  )
}

export default RecoverPasswordSetPage
