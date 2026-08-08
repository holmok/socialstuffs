import ResendValidationForm from '@templates/components/resend-validation-form'

const ResendValidationPage = () => {
  return (
    <>
      <h1>Resend Validation Email</h1>
      <p>Enter your email and, if it matches a pending account, we'll send a new validation link.</p>
      <ResendValidationForm />
    </>
  )
}

export default ResendValidationPage
