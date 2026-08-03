interface ErrorPageProps {
  status: number
  message?: string
  detail?: string
}

const ErrorPage = ({ status, message, detail }: ErrorPageProps) => {
  const is404 = status === 404
  const isServerError = status >= 500
  return (
    <div class="error-page">
      <p class="status-code">{status}</p>
      {is404 ? (
        <h1>
          There&rsquo;s no <span class="stuff">stuff</span> here.
        </h1>
      ) : isServerError ? (
        <h1>
          We broke something. It wasn&rsquo;t <span class="stuff">you</span>.
        </h1>
      ) : (
        <h1>Well, that didn&rsquo;t work.</h1>
      )}
      <p class="error-copy">
        {is404
          ? "This page doesn't exist. Maybe it moved, maybe it never did. Nobody's hiding it from you — there's no algorithm here, just a missing page."
          : isServerError
            ? "Something went wrong on our end. We're a small operation, so give us a moment and try again. If it keeps happening, please tell us."
            : message || "Something about that request wasn't right. Backing up and trying again usually does the trick."}
      </p>
      <div class="error-actions">
        <a class="cta" href="/">
          Go home
        </a>
        {isServerError && (
          <a class="cta quiet" href="/contact">
            Tell us
          </a>
        )}
      </div>
      {detail && <pre class="error-detail">{detail}</pre>}
    </div>
  )
}

export default ErrorPage
