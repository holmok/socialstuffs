import WaitlistForm, { type WaitlistFormProps, WaitlistThanks } from '@templates/components/waitlist-form'

// form props flow through so no-JS error re-renders of the full page keep the typed values;
// joined renders the post-submit thank-you in place of the form (no-JS lands on /waitlist?joined=1)
const WaitlistPage = ({ joined = false, ...props }: WaitlistFormProps & { joined?: boolean } = {}) => {
  return (
    <>
      <h1 className="form-heading">Join the Waitlist</h1>
      <p className="form-note form-intro">
        socialstuffs is invite-only while we grow. Drop your email below and we'll save your spot in line. As we're ready to add
        new people, we'll email you an invite code — keep an eye on your inbox, and use the code on the sign-up page to create
        your account.
      </p>
      {joined ? <WaitlistThanks /> : <WaitlistForm {...props} />}
    </>
  )
}

export default WaitlistPage
