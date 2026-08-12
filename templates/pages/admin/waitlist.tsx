import AdminTabs from '@templates/components/admin/tabs'
import WaitlistTable, { type AdminWaitlistRow } from '@templates/components/admin/waitlist-table'

type AdminWaitlistPageProps = {
  rows: AdminWaitlistRow[]
  page: number
  hasNewer: boolean
  hasOlder: boolean
}

const AdminWaitlistPage = ({ rows, page, hasNewer, hasOlder }: AdminWaitlistPageProps) => {
  return (
    <div>
      <AdminTabs activeTab="waitlist" />
      <h1 className="user-heading">Waitlist</h1>
      <p className="admin-note">
        People waiting for an invite, oldest first. Check who you want to let in and send their invites — each gets an emailed
        invite code and a sign-up link.
      </p>
      <WaitlistTable
        rows={rows}
        action={{ url: '/admin/waitlist/send', label: 'Send Invites' }}
        page={page}
        hasNewer={hasNewer}
        hasOlder={hasOlder}
        basePath="/admin/waitlist"
        emptyMessage="No one is waiting for an invite right now."
      />
    </div>
  )
}

export default AdminWaitlistPage
