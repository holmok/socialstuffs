import UserSettingsForm from '@templates/components/user/settings-form'
import UserTabs from '@templates/components/user/tabs'

type UserSettingsPageProps = {
  username?: string
  email?: string
}

const UserSettingsPage = ({ username, email }: UserSettingsPageProps) => {
  return (
    <div>
      <UserTabs activeTab="settings" />
      <h1 className="user-heading">Edit Settings</h1>
      <UserSettingsForm username={username} email={email} />
    </div>
  )
}

export default UserSettingsPage
