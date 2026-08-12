import AdminTabs from '@templates/components/admin/tabs'
import WaitlistTable, { type AdminWaitlistRow } from '@templates/components/admin/waitlist-table'

type AdminWaitlistUnclaimedPageProps = {
  rows: AdminWaitlistRow[]
  page: number
  hasNewer: boolean
  hasOlder: boolean
}

const AdminWaitlistUnclaimedPage = ({ rows, page, hasNewer, hasOlder }: AdminWaitlistUnclaimedPageProps) => {
  return (
    <div>
      <AdminTabs activeTab="waitlist-unclaimed" />
      <h1 className="user-heading">Unclaimed Invites</h1>
      <p className="admin-note">
        Waitlist invites that were sent but haven't been used to sign up yet. Revoking one disables the code, emails the person,
        and puts them back on the waitlist.
      </p>
      <WaitlistTable
        rows={rows}
        action={{ url: '/admin/waitlist-unclaimed/revoke', label: 'Revoke Invites' }}
        showSent
        page={page}
        hasNewer={hasNewer}
        hasOlder={hasOlder}
        basePath="/admin/waitlist-unclaimed"
        emptyMessage="No outstanding invites right now."
      />
    </div>
  )
}

export default AdminWaitlistUnclaimedPage
