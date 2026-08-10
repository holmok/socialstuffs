import ResendValidationForm, { type ResendValidationFormProps } from '@templates/components/resend-validation-form'

// form props flow through so no-JS error re-renders of the full page keep the typed values
const ResendValidationPage = (props: ResendValidationFormProps = {}) => {
  return (
    <>
      <h1 className="form-heading">Resend Validation Email</h1>
      <p>Enter your email and, if it matches a pending account, we'll send a new validation link.</p>
      <ResendValidationForm {...props} />
    </>
  )
}

export default ResendValidationPage
