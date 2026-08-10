function removeFlashItem(item) {
  const container = item.closest('.flash')
  item.remove()
  if (container && container.children.length === 0) container.remove()
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('.flash-close')
  if (!button) return

  const item = button.closest('.flash-item')
  if (!item) return

  removeFlashItem(item)
})

// flash notices dismiss themselves after 10 seconds; the close button still clears them sooner
const FLASH_DISMISS_MS = 10000

function scheduleFlashDismissals() {
  for (const item of document.querySelectorAll('.flash-item:not([data-dismiss-scheduled])')) {
    item.dataset.dismissScheduled = 'true'
    setTimeout(() => {
      if (item.isConnected) removeFlashItem(item)
    }, FLASH_DISMISS_MS)
  }
}

document.addEventListener('DOMContentLoaded', scheduleFlashDismissals)
// flashes injected by HTMX responses (the out-of-band error fragments) need timers too
document.addEventListener('htmx:afterSwap', scheduleFlashDismissals)
document.addEventListener('htmx:oobAfterSwap', scheduleFlashDismissals)

// Surface transport-level htmx failures (server unreachable, request dropped)
// as a native-looking, dismissible flash. Server HTTP errors are handled elsewhere.
function showTransportError(message) {
  let container = document.querySelector('.flash')
  if (!container) {
    container = document.createElement('div')
    container.className = 'flash'
    const main = document.querySelector('main')
    if (main?.parentNode) main.parentNode.insertBefore(container, main)
    else document.body.appendChild(container)
  }

  const item = document.createElement('div')
  item.className = 'flash-item flash-error'
  item.setAttribute('role', 'alert')

  const text = document.createElement('p')
  text.textContent = message
  item.appendChild(text)

  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'flash-close'
  close.setAttribute('aria-label', 'Dismiss message')
  close.innerHTML = '&times;'
  item.appendChild(close)

  container.appendChild(item)
  // no htmx swap event fires for transport failures, so start this item's timer directly
  scheduleFlashDismissals()
}

const transportErrorMessage = "Couldn't reach the server. Please check your connection and try again."
document.addEventListener('htmx:sendError', () => showTransportError(transportErrorMessage))
document.addEventListener('htmx:timeout', () => showTransportError(transportErrorMessage))
