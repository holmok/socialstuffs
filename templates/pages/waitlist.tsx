import WaitlistForm, { type WaitlistFormProps } from '@templates/components/waitlist-form'

// form props flow through so no-JS error re-renders of the full page keep the typed values
const WaitlistPage = (props: WaitlistFormProps = {}) => {
  return (
    <>
      <h1 className="form-heading">Join the Waitlist</h1>
      <p className="form-note form-intro">
        socialstuffs is invite-only while we grow. Drop your email below and we'll save your spot in line. As we're ready to add
        new people, we'll email you an invite code — keep an eye on your inbox, and use the code on the sign-up page to create
        your account.
      </p>
      <WaitlistForm {...props} />
    </>
  )
}

export default WaitlistPage
