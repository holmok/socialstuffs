// Restore keyboard focus after HTMX outerHTML swaps destroy the focused element:
// errored form re-renders focus their first invalid input, and the profile actions
// block re-focuses its first button so keyboard users are not dropped to <body>.
document.addEventListener('htmx:afterSwap', (event) => {
  const swapped = event.target
  if (!(swapped instanceof Element)) return

  const invalid = swapped.querySelector('[aria-invalid="true"]')
  if (invalid) {
    invalid.focus()
    return
  }

  if (swapped.id === 'profile-actions' && document.activeElement === document.body) {
    const button = swapped.querySelector('button')
    if (button) button.focus()
  }
})
