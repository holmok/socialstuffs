// image lightbox: <a data-lightbox href="<image url>"><img ...></a> opens the image in a
// modal <dialog> instead of navigating (the href is the no-JS fallback). the × button,
// a backdrop click, and Esc all close it. delegated so it keeps working after HTMX swaps
let dialog = null
let image = null

function ensureDialog() {
  if (dialog) return
  dialog = document.createElement('dialog')
  dialog.className = 'lightbox'
  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'lightbox-close'
  close.setAttribute('aria-label', 'Close')
  close.textContent = '×'
  close.addEventListener('click', () => dialog.close())
  image = document.createElement('img')
  image.className = 'lightbox-image'
  image.alt = ''
  dialog.append(close, image)
  // a click outside the image lands on the dialog element itself, not its children
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close()
  })
  document.body.append(dialog)
}

document.addEventListener('click', (event) => {
  const link = event.target instanceof Element ? event.target.closest('a[data-lightbox]') : null
  if (!link) return
  event.preventDefault()
  ensureDialog()
  image.src = link.href
  image.alt = link.querySelector('img')?.alt || ''
  dialog.showModal()
})
