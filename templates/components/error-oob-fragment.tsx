interface ErrorOobFragmentProps {
  status: number
  message?: string
}

// Injected out-of-band so a global error hitting an HTMX form surfaces as a flash
// message instead of replacing the form. Appends into the layout's permanent
// #flash-region; flash.js merges sibling .flash containers so repeated errors
// collect as .flash-item rows in a single .flash container.
const ErrorOobFragment = ({ status, message }: ErrorOobFragmentProps) => {
  return (
    <div className="flash" hx-swap-oob="beforeend:#flash-region">
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
