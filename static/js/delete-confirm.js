// delete-account modal on /user/data: opens the <dialog> and only enables the
// destructive submit once the user has typed the word "delete"
document.addEventListener('DOMContentLoaded', () => {
  const open = document.getElementById('delete-account-open')
  const modal = document.getElementById('delete-account-modal')
  const input = document.getElementById('delete-confirm-input')
  const submit = document.getElementById('delete-account-submit')
  const cancel = document.getElementById('delete-account-cancel')
  if (!open || !modal || !input || !submit || !cancel) return

  open.addEventListener('click', () => {
    input.value = ''
    submit.disabled = true
    modal.showModal()
  })

  cancel.addEventListener('click', () => modal.close())

  input.addEventListener('input', () => {
    submit.disabled = input.value.trim().toLowerCase() !== 'delete'
  })
})
