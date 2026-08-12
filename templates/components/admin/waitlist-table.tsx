export type AdminWaitlistRow = {
  id: number
  email: string
  created: Date
  sent: Date | null
}

type WaitlistTableProps = {
  rows: AdminWaitlistRow[]
  // where the checked ids POST to and what the submit button says (send vs revoke)
  action: { url: string; label: string }
  // the unclaimed-invites view adds the Invited column
  showSent?: boolean
  page: number
  hasNewer: boolean
  hasOlder: boolean
  basePath: string
  emptyMessage: string
}

const formatDate = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

// shared by the admin waitlist and unclaimed-invites pages: a checkbox-per-row table whose
// selection posts to the page's action (no-JS friendly — it's a plain form post)
const WaitlistTable = ({
  rows,
  action,
  showSent = false,
  page,
  hasNewer,
  hasOlder,
  basePath,
  emptyMessage
}: WaitlistTableProps) => {
  if (rows.length === 0 && page === 1) {
    return <p className="admin-empty">{emptyMessage}</p>
  }
  return (
    <>
      <form method="post" action={action.url}>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th className="admin-check-col">
                  <span className="visually-hidden">Select</span>
                </th>
                <th>Email</th>
                <th>Joined</th>
                {showSent && <th>Invited</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="admin-check-col">
                    <input type="checkbox" name="ids" value={String(row.id)} aria-label={`Select ${row.email}`} />
                  </td>
                  <td>{row.email}</td>
                  <td>{formatDate(row.created)}</td>
                  {showSent && <td>{row.sent ? formatDate(row.sent) : ''}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="admin-actions">
          <button type="submit" className="primary-button">
            {action.label}
          </button>
        </div>
      </form>
      {(hasNewer || hasOlder) && (
        <nav className="admin-pagination" aria-label="Waitlist pages">
          {hasNewer && <a href={`${basePath}?p=${page - 1}`}>« Previous</a>}
          {hasOlder && <a href={`${basePath}?p=${page + 1}`}>Next »</a>}
        </nav>
      )}
    </>
  )
}

export default WaitlistTable
