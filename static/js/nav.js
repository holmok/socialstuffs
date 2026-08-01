document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.nav-toggle')
  const menu = document.getElementById('site-nav')
  if (!toggle || !menu) return

  const close = () => {
    menu.classList.remove('open')
    toggle.setAttribute('aria-expanded', 'false')
  }

  toggle.addEventListener('click', () => {
    const open = menu.classList.toggle('open')
    toggle.setAttribute('aria-expanded', String(open))
  })

  document.addEventListener('click', (event) => {
    if (!menu.classList.contains('open')) return
    if (toggle.contains(event.target) || menu.contains(event.target)) return
    close()
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menu.classList.contains('open')) {
      close()
      toggle.focus()
    }
  })
})
