document.addEventListener('click', (event) => {
  const button = event.target.closest('.flash-close')
  if (!button) return

  const item = button.closest('.flash-item')
  if (!item) return

  const container = item.closest('.flash')
  item.remove()
  if (container && container.children.length === 0) container.remove()
})
