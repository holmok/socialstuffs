import type { UserProfileInfo } from '@data/user-data'
import EditProfileForm from '@templates/components/user/edit-profile-form'
import UserTabs from '@templates/components/user/tabs'

type UserEditProfilePageProps = {
  info: UserProfileInfo
  // error re-render props so the no-JS full page keeps the typed values and errors
  errors?: Record<string, string[]>
  imageDroppedNote?: boolean
}

const UserEditProfilePage = ({ info, errors, imageDroppedNote }: UserEditProfilePageProps) => {
  return (
    <div>
      <UserTabs activeTab="edit-profile" />
      <h1 className="user-heading">Edit Profile</h1>
      <EditProfileForm {...info} errors={errors} imageDroppedNote={imageDroppedNote} />
    </div>
  )
}

export default UserEditProfilePage
