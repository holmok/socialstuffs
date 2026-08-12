interface AdminTabsProps {
  activeTab: 'dashboard' | 'waitlist' | 'waitlist-unclaimed'
}

// reuses the .user-tabs styles from the user pages, so pages including this also load the 'user' style
const AdminTabs = ({ activeTab }: AdminTabsProps) => {
  return (
    <div className="user-tabs">
      <ul className="user-tabs-list">
        <li className={`user-tab ${activeTab === 'dashboard' ? 'active' : ''}`}>
          <a href="/admin" aria-current={activeTab === 'dashboard' ? 'page' : undefined}>
            Dashboard
          </a>
        </li>
        <li className={`user-tab ${activeTab === 'waitlist' ? 'active' : ''}`}>
          <a href="/admin/waitlist" aria-current={activeTab === 'waitlist' ? 'page' : undefined}>
            Waitlist
          </a>
        </li>
        <li className={`user-tab ${activeTab === 'waitlist-unclaimed' ? 'active' : ''}`}>
          <a href="/admin/waitlist-unclaimed" aria-current={activeTab === 'waitlist-unclaimed' ? 'page' : undefined}>
            Unclaimed Invites
          </a>
        </li>
      </ul>
    </div>
  )
}

export default AdminTabs
