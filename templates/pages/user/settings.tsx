import UserSettingsForm, { type UserSettingsFormProps } from '@templates/components/user/settings-form'
import UserTabs from '@templates/components/user/tabs'

// form props flow through so no-JS error re-renders of the full page keep the typed values
const UserSettingsPage = (props: UserSettingsFormProps) => {
  return (
    <div>
      <UserTabs activeTab="settings" />
      <h1 className="user-heading">Edit Settings</h1>
      <UserSettingsForm {...props} />
    </div>
  )
}

export default UserSettingsPage
