import AdminTabs from '@templates/components/admin/tabs'

export type AdminStats = {
  waitlistWaiting: number
  invitesOutstanding: number
  waitlistJoined: number
  usersTotal: number
  usersActive: number
  usersNewWeek: number
  postsTotal: number
  postsPublished: number
  commentsTotal: number
  userInvitesUnclaimed: number
  userInvitesClaimed: number
}

type AdminDashboardPageProps = {
  stats: AdminStats
}

const AdminDashboardPage = ({ stats }: AdminDashboardPageProps) => {
  const cards: { label: string; value: number; note?: string }[] = [
    { label: 'On the Waitlist', value: stats.waitlistWaiting, note: 'waiting for an invite' },
    { label: 'Invites Outstanding', value: stats.invitesOutstanding, note: 'sent but not yet claimed' },
    { label: 'Joined from Waitlist', value: stats.waitlistJoined, note: 'claimed their invite' },
    { label: 'Users', value: stats.usersTotal, note: `${stats.usersActive} active` },
    { label: 'New Users (7 days)', value: stats.usersNewWeek },
    { label: 'Posts', value: stats.postsTotal, note: `${stats.postsPublished} published` },
    { label: 'Comments', value: stats.commentsTotal },
    { label: 'User Invites Available', value: stats.userInvitesUnclaimed, note: 'unclaimed member codes' },
    { label: 'User Invites Claimed', value: stats.userInvitesClaimed, note: 'sign-ups via member codes' }
  ]
  return (
    <div>
      <AdminTabs activeTab="dashboard" />
      <h1 className="user-heading">Admin Dashboard</h1>
      <div className="admin-stats">
        {cards.map((card) => (
          <div key={card.label} className="card stat-card">
            <p className="stat-value">{card.value.toLocaleString('en-US')}</p>
            <p className="stat-label">{card.label}</p>
            {card.note && <p className="stat-note">{card.note}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

export default AdminDashboardPage
