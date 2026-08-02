interface ErrorFragmentProps {
  status: number
  message?: string
}

const ErrorFragment = ({ status, message }: ErrorFragmentProps) => {
  return (
    <div class="error-fragment" role="alert">
      <strong>{status}</strong> {message || 'Something went wrong on our end. Please try again.'}
    </div>
  )
}

export default ErrorFragment
