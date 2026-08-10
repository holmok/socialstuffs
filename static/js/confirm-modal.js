// generic confirm dialogs: a click on [data-modal-open="<dialog id>"] opens that <dialog>,
// and [data-modal-close] closes the dialog it sits in. delegated so it survives HTMX swaps
document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return
  const opener = event.target.closest('[data-modal-open]')
  if (opener) {
    const modal = document.getElementById(opener.getAttribute('data-modal-open'))
    if (modal instanceof HTMLDialogElement) modal.showModal()
    return
  }
  const closer = event.target.closest('[data-modal-close]')
  if (closer) closer.closest('dialog')?.close()
})
