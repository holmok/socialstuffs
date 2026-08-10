import type { RelationType } from '@data/relation-data'

export type ProfileActionsProps = {
  profileUid: string
  isSelf: boolean
  relation: RelationType | null
  favorited: boolean
  approvals: number
  disapprovals: number
}

type ActionFormProps = {
  path: string
  label: string
  active: boolean
  activeClass: string
}

const ActionForm = ({ path, label, active, activeClass }: ActionFormProps) => (
  <form action={path} method="post" hx-post={path} hx-target="#profile-actions" hx-swap="outerHTML" hx-disabled-elt="find button">
    <button type="submit" className={active ? `profile-action ${activeClass}` : 'profile-action'} aria-pressed={active}>
      {label}
    </button>
  </form>
)

// the whole block (buttons + tallies) is one fragment so a single HTMX swap refreshes both
const ProfileActions = (props: ProfileActionsProps) => {
  const { profileUid, isSelf, relation, favorited, approvals, disapprovals } = props
  const base = `/profile/${profileUid}`
  return (
    <div id="profile-actions">
      {isSelf ? (
        <a className="profile-edit-link" href="/user/edit-profile">
          Edit Profile
        </a>
      ) : (
        <>
          <div className="profile-action-row">
            <ActionForm
              path={`${base}/approve`}
              label={relation === 'approve' ? 'Approved' : 'Approve'}
              active={relation === 'approve'}
              activeClass="profile-action-approve"
            />
            <ActionForm
              path={`${base}/disapprove`}
              label={relation === 'disapprove' ? 'Disapproved' : 'Disapprove'}
              active={relation === 'disapprove'}
              activeClass="profile-action-disapprove"
            />
          </div>
          <ActionForm
            path={`${base}/favorite`}
            label={favorited ? 'Favorited' : 'Favorite'}
            active={favorited}
            activeClass="profile-action-favorite"
          />
        </>
      )}
      <div className="profile-tallies">
        <div className="profile-tally">
          <span className="profile-tally-count">{approvals}</span>
          <span className="profile-tally-label">Approvals</span>
        </div>
        <div className="profile-tally">
          <span className="profile-tally-count">{disapprovals}</span>
          <span className="profile-tally-label">Disapprovals</span>
        </div>
      </div>
    </div>
  )
}

export default ProfileActions
