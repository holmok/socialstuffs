import UserTabs from '@templates/components/user/tabs'

type UserDataPageProps = {
  lastExportUrl?: string
}

// export zips live at user_data/dt=YYYY-MM-DD/<uid>_data.zip — pull the date back out for display
function exportDateFromUrl(url: string) {
  const match = url.match(/\/dt=(\d{4})-(\d{2})-(\d{2})\//)
  return match ? `${match[2]}/${match[3]}/${match[1]}` : undefined
}

const UserDataPage = ({ lastExportUrl }: UserDataPageProps) => {
  const exportDate = lastExportUrl ? exportDateFromUrl(lastExportUrl) : undefined
  return (
    <div>
      <UserTabs activeTab="data" />
      <h1 className="user-heading">My Data</h1>
      <div className="card data-card">
        <h2>Export My Data</h2>
        <p className="form-note">
          Download a zip of your profile, posts, comments, and images. You can generate one export per day.
        </p>
        {lastExportUrl && (
          <p className="data-export-link">
            <a href={lastExportUrl}>Download your latest export</a>
            {exportDate && ` created on ${exportDate}`}
          </p>
        )}
        <form
          action="/user/data/export"
          method="post"
          hx-post="/user/data/export"
          hx-disabled-elt="find button"
          hx-indicator="find .form-indicator"
        >
          <button type="submit" className="primary-button">
            Generate Your Data Export
          </button>
          <span className="form-indicator" aria-live="polite">
            Working…
          </span>
        </form>
      </div>
      <div className="card data-card danger-card">
        <h2>Delete My Account</h2>
        <p className="form-note">
          Permanently delete your account, posts, comments, favorites, and images. This cannot be undone.
        </p>
        <button type="button" id="delete-account-open" className="danger-button">
          Delete My Account…
        </button>
        <dialog id="delete-account-modal" className="delete-modal" aria-labelledby="delete-account-title">
          <form action="/user/data/delete" method="post">
            <h3 id="delete-account-title">Are you sure?</h3>
            <p className="form-note">
              This permanently deletes your account and all of your content. Type <strong>delete</strong> and enter your password
              to confirm.
            </p>
            <label htmlFor="delete-confirm-input">Type "delete" to confirm</label>
            <input id="delete-confirm-input" name="confirm" type="text" placeholder='Type "delete"...' autocomplete="off" />
            <label htmlFor="delete-password-input">Your password</label>
            <input
              id="delete-password-input"
              name="password"
              type="password"
              placeholder="Enter your password..."
              autocomplete="current-password"
            />
            <div className="modal-actions">
              <button type="button" id="delete-account-cancel">
                Cancel
              </button>
              <button type="submit" id="delete-account-submit" className="danger-button" disabled>
                Delete My Account
              </button>
            </div>
          </form>
        </dialog>
      </div>
    </div>
  )
}

export default UserDataPage
