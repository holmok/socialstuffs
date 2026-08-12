interface UserTabsProps {
  activeTab: 'my-profile' | 'edit-profile' | 'settings' | 'invite-codes' | 'data'
}
const UserTabs = ({ activeTab }: UserTabsProps) => {
  return (
    <div className="user-tabs">
      <ul className="user-tabs-list">
        <li className={`user-tab ${activeTab === 'my-profile' ? 'active' : ''}`}>
          <a href="/user" aria-current={activeTab === 'my-profile' ? 'page' : undefined}>
            My Profile
          </a>
        </li>
        <li className={`user-tab ${activeTab === 'edit-profile' ? 'active' : ''}`}>
          <a href="/user/edit-profile" aria-current={activeTab === 'edit-profile' ? 'page' : undefined}>
            Edit Profile
          </a>
        </li>
        <li className={`user-tab ${activeTab === 'settings' ? 'active' : ''}`}>
          <a href="/user/settings" aria-current={activeTab === 'settings' ? 'page' : undefined}>
            Settings
          </a>
        </li>
        <li className={`user-tab ${activeTab === 'invite-codes' ? 'active' : ''}`}>
          <a href="/user/invite-codes" aria-current={activeTab === 'invite-codes' ? 'page' : undefined}>
            Invites
          </a>
        </li>
        <li className={`user-tab ${activeTab === 'data' ? 'active' : ''}`}>
          <a href="/user/data" aria-current={activeTab === 'data' ? 'page' : undefined}>
            Data
          </a>
        </li>
      </ul>
    </div>
  )
}

export default UserTabs
