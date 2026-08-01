import Navigation from '@components/navigation'

const Header = () => {
  return (
    <header>
      <div class="header-inner">
        <a class="site-title" href="/">
          Bun <span>+</span> Hono <span>+</span> HTMX
        </a>
        <Navigation />
      </div>
    </header>
  )
}

export default Header
