import type { UserProfileInfo } from '@data/user-data'
import UserTabs from '@templates/components/user/tabs'

type UserMyProfilePageProps = {
  uid: string
  username: string
  created?: Date
  info: UserProfileInfo
}

const UserMyProfilePage = ({ uid, username, created, info }: UserMyProfilePageProps) => {
  const meta = [info.title, info.location].filter(Boolean).join(' · ')
  const memberSince = created?.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  return (
    <div>
      <UserTabs activeTab="my-profile" />
      <div className="profile-card">
        <img className="profile-avatar" src={info.profileImageUrl} alt={`Avatar for ${username}`} />
        <h1 className="profile-name">{info.fullname || username}</h1>
        <p className="profile-username">@{username}</p>
        {meta && <p className="profile-meta">{meta}</p>}
        {info.bio && <p className="profile-bio">{info.bio}</p>}
        {memberSince && <p className="profile-since">Member since {memberSince}</p>}
        <div className="profile-links">
          <a className="profile-edit-link" href="/user/edit-profile">
            Edit Profile
          </a>
          <a className="profile-edit-link" href={`/profile/${uid}`}>
            View Profile
          </a>
        </div>
      </div>
    </div>
  )
}

export default UserMyProfilePage
