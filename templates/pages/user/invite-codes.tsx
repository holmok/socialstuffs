import UserTabs from '@templates/components/user/tabs'

export type AvailableInviteCode = {
  id: number
  code: string
  created: Date
}

export type ClaimedInviteCode = {
  code: string
  claimed: Date | null
  claimedByUid: string
  claimedByName: string
}

type InviteCodesPageProps = {
  available: AvailableInviteCode[]
  claimed: ClaimedInviteCode[]
}

const formatDate = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

const InviteCodesPage = ({ available, claimed }: InviteCodesPageProps) => {
  return (
    <div>
      <UserTabs activeTab="invite-codes" />
      <h1 className="user-heading">Invites</h1>
      <div className="card data-card">
        <h2>Available Invite Codes</h2>
        <p className="form-note">
          Share a code with someone you want on socialstuffs — they enter it when they sign up, and you become one of their
          favorites automatically. Refresh a code to replace it if it leaked somewhere you didn't intend.
        </p>
        {available.length === 0 && <p className="invite-empty">No invite codes available right now.</p>}
        {available.length > 0 && (
          <ul className="invite-list">
            {available.map((invite) => (
              <li key={invite.id} className="invite-row">
                <code className="invite-code">{invite.code}</code>
                <form
                  action={`/user/invite-codes/${invite.id}/refresh`}
                  method="post"
                  hx-post={`/user/invite-codes/${invite.id}/refresh`}
                  hx-disabled-elt="find button"
                >
                  <button type="submit" className="invite-refresh">
                    Refresh
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="card data-card">
        <h2>Claimed Invite Codes</h2>
        {claimed.length === 0 && <p className="invite-empty">No one has used one of your invite codes yet.</p>}
        {claimed.length > 0 && (
          <ul className="invite-list">
            {claimed.map((invite) => (
              <li key={invite.code} className="invite-row">
                <code className="invite-code">{invite.code}</code>
                <span className="invite-claimed-by">
                  claimed by <a href={`/profile/${invite.claimedByUid}`}>{invite.claimedByName}</a>
                  {invite.claimed && ` on ${formatDate(invite.claimed)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default InviteCodesPage
