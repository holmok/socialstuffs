import type { UserProfileInfo } from '@data/user-data'
import EditProfileForm from '@templates/components/user/edit-profile-form'
import UserTabs from '@templates/components/user/tabs'

type UserEditProfilePageProps = {
  info: UserProfileInfo
}

const UserEditProfilePage = ({ info }: UserEditProfilePageProps) => {
  return (
    <div>
      <UserTabs activeTab="edit-profile" />
      <h1 className="user-heading">Edit Profile</h1>
      <EditProfileForm {...info} />
    </div>
  )
}

export default UserEditProfilePage
