interface ErrorOobFragmentProps {
  status: number
  message?: string
}

// Injected out-of-band so a global error hitting an HTMX form surfaces as a flash
// message instead of replacing the form. Targets `main` (always present) with
// beforebegin, recreating the flash region where the layout renders it.
const ErrorOobFragment = ({ status, message }: ErrorOobFragmentProps) => {
  return (
    <div className="flash" hx-swap-oob="beforebegin:main">
      <div className="flash-item flash-error" role="alert">
        <p>
          <strong>{status}</strong> {message || 'Something went wrong on our end. Please try again.'}
        </p>
        <button type="button" className="flash-close" aria-label="Dismiss message">
          &times;
        </button>
      </div>
    </div>
  )
}

export default ErrorOobFragment
